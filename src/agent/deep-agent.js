/**
 * Darksol Deep Agent — Autonomous agent loop with tool calling.
 *
 * The core agent loop: prompt → LLM → tool calls → execute → feed back → repeat.
 * Works with any OpenAI-compatible API (local via node-llama-cpp, Ollama, cloud APIs).
 *
 * Inspired by LangChain's deepagents but zero-dependency vanilla Node.js.
 */

import { TOOL_DEFINITIONS, executeTool } from "./tools.js";
import { buildSystemPrompt } from "./prompts.js";

/** Max iterations before hard stop (prevents infinite loops) */
const MAX_ITERATIONS = 100;

/** Approximate chars-per-token for context estimation */
const CHARS_PER_TOKEN = 4;

/**
 * @typedef {Object} AgentConfig
 * @property {string} [model] - Model identifier
 * @property {string} [systemPrompt] - Custom system prompt
 * @property {string} [apiBase] - API base URL (default: http://127.0.0.1:11435)
 * @property {string} [apiKey] - API key (default: none)
 * @property {number} [maxIterations] - Max tool-call loops (default: 100)
 * @property {number} [temperature] - Temperature (default: 0)
 * @property {boolean} [planning] - Enable planning/todos (default: true)
 * @property {boolean} [verbose] - Log each step (default: false)
 * @property {function} [onStep] - Callback for each step: (type, data) => void
 * @property {function} [onToken] - Streaming callback: (token) => void
 * @property {string} [cwd] - Working directory for the agent
 * @property {AbortSignal} [signal] - Abort signal
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} response - Final text response
 * @property {Array<Object>} messages - Full conversation history
 * @property {Array<Object>} [todos] - Final todo list if used
 * @property {number} iterations - Number of tool-call iterations
 * @property {number} totalTokensEstimate - Approximate total tokens used
 */

/**
 * Create a deep agent that can plan, read/write files, run commands, and iterate.
 *
 * @param {AgentConfig} [config={}]
 * @returns {{ run: (message: string) => Promise<AgentResult>, runStream: (message: string) => AsyncGenerator }}
 */
export function createDarksolAgent(config = {}) {
  const {
    model = "auto",
    systemPrompt: userPrompt,
    apiBase = "http://127.0.0.1:11435",
    apiKey,
    maxIterations = MAX_ITERATIONS,
    temperature = 0,
    planning = true,
    verbose = false,
    onStep,
    onToken,
    cwd,
    signal,
  } = config;

  // Shared state across the agent's lifetime
  const agentState = {
    todos: [],
    conversationHistory: [],
    iterationCount: 0,
  };

  // Set working directory
  if (cwd) {
    try { process.chdir(cwd); } catch { /* ignore */ }
  }

  /**
   * Call the LLM via OpenAI-compatible API.
   * @param {Array<Object>} messages
   * @param {boolean} [stream=false]
   * @returns {Promise<Object>} Response with message and optional tool_calls
   */
  async function callLLM(messages, stream = false) {
    const systemMsg = buildSystemPrompt({
      userPrompt,
      planning,
      todos: agentState.todos,
    });

    const fullMessages = [
      { role: "system", content: systemMsg },
      ...messages,
    ];

    const body = {
      model: model === "auto" ? undefined : model,
      messages: fullMessages,
      tools: TOOL_DEFINITIONS,
      temperature,
      stream,
    };

    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    if (stream) {
      return parseSSEStream(response, onToken);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error("No response from LLM");
    }

    return {
      message: choice.message,
      finishReason: choice.finish_reason,
      usage: data.usage,
    };
  }

  /**
   * Parse SSE stream and extract the complete response.
   */
  async function parseSSEStream(response, tokenCallback) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let toolCalls = [];
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const reason = parsed.choices?.[0]?.finish_reason;

          if (reason) finishReason = reason;

          if (delta?.content) {
            fullContent += delta.content;
            if (tokenCallback) tokenCallback(delta.content);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || `call_${idx}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    const message = {
      role: "assistant",
      content: fullContent || null,
    };
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    return { message, finishReason };
  }

  /**
   * Run a single agent turn: send messages, get response, execute tools if any.
   * Returns true if the agent wants to continue (has tool calls), false if done.
   */
  async function runTurn() {
    const emit = (type, data) => {
      if (onStep) onStep(type, data);
      if (verbose) {
        const ts = new Date().toISOString().substring(11, 19);
        if (type === "thinking") console.log(`[${ts}] 🧠 Thinking...`);
        if (type === "tool_call") console.log(`[${ts}] 🔧 ${data.name}(${JSON.stringify(data.args).substring(0, 100)})`);
        if (type === "tool_result") console.log(`[${ts}] 📋 ${data.result.substring(0, 200)}`);
        if (type === "response") console.log(`[${ts}] 💬 ${data.content.substring(0, 200)}`);
      }
    };

    emit("thinking", {});

    const { message, finishReason } = await callLLM(
      agentState.conversationHistory,
      !!onToken,
    );

    // Add assistant message to history
    agentState.conversationHistory.push(message);

    // If no tool calls, we're done
    if (!message.tool_calls || message.tool_calls.length === 0) {
      emit("response", { content: message.content || "" });
      return false;
    }

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const fnName = toolCall.function?.name;
      let args;
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch {
        args = {};
      }

      emit("tool_call", { name: fnName, args, id: toolCall.id });

      const result = await executeTool(fnName, args, agentState);

      emit("tool_result", { name: fnName, result, id: toolCall.id });

      // Add tool result to history
      agentState.conversationHistory.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    return true; // Continue — agent needs to process tool results
  }

  /**
   * Estimate total tokens in conversation.
   */
  function estimateTokens() {
    let chars = 0;
    for (const msg of agentState.conversationHistory) {
      chars += (msg.content || "").length;
      if (msg.tool_calls) {
        chars += JSON.stringify(msg.tool_calls).length;
      }
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  return {
    /**
     * Run the agent to completion (one-shot).
     * @param {string} message - User message
     * @returns {Promise<AgentResult>}
     */
    async run(message) {
      agentState.conversationHistory.push({
        role: "user",
        content: message,
      });

      let iterations = 0;

      while (iterations < maxIterations) {
        iterations++;
        agentState.iterationCount = iterations;

        const shouldContinue = await runTurn();
        if (!shouldContinue) break;

        // Safety: check if we're in an infinite loop (same tool calls repeating)
        if (iterations > 5) {
          const recent = agentState.conversationHistory.slice(-6);
          const toolNames = recent
            .filter((m) => m.tool_calls)
            .flatMap((m) => m.tool_calls.map((tc) => tc.function?.name));
          if (toolNames.length >= 4 && new Set(toolNames).size === 1) {
            // Same tool called 4+ times in a row — likely stuck
            agentState.conversationHistory.push({
              role: "user",
              content: "[System: You appear to be repeating the same action. Please provide your final response or try a different approach.]",
            });
          }
        }
      }

      // Get final response
      const lastAssistant = [...agentState.conversationHistory]
        .reverse()
        .find((m) => m.role === "assistant" && m.content);

      return {
        response: lastAssistant?.content || "(Agent completed without a text response)",
        messages: agentState.conversationHistory,
        todos: agentState.todos.length > 0 ? agentState.todos : undefined,
        iterations,
        totalTokensEstimate: estimateTokens(),
      };
    },

    /**
     * Run the agent with streaming output.
     * Yields events as they happen.
     * @param {string} message
     * @returns {AsyncGenerator<{type: string, data: any}>}
     */
    async *runStream(message) {
      const events = [];
      let resolveWait;
      let done = false;

      const originalOnStep = onStep;

      // Override onStep to capture events
      const captureStep = (type, data) => {
        events.push({ type, data });
        if (originalOnStep) originalOnStep(type, data);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      };

      // Run in background
      const runPromise = (async () => {
        agentState.conversationHistory.push({ role: "user", content: message });

        let iterations = 0;
        while (iterations < maxIterations) {
          iterations++;
          agentState.iterationCount = iterations;

          captureStep("thinking", {});

          const { message: assistantMsg } = await callLLM(
            agentState.conversationHistory,
            false,
          );

          agentState.conversationHistory.push(assistantMsg);

          if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
            captureStep("response", { content: assistantMsg.content || "" });
            break;
          }

          for (const toolCall of assistantMsg.tool_calls) {
            const fnName = toolCall.function?.name;
            let args;
            try { args = JSON.parse(toolCall.function?.arguments || "{}"); } catch { args = {}; }

            captureStep("tool_call", { name: fnName, args, id: toolCall.id });

            const result = await executeTool(fnName, args, agentState);

            captureStep("tool_result", { name: fnName, result, id: toolCall.id });

            agentState.conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }

        done = true;
        if (resolveWait) resolveWait();
      })();

      // Yield events as they come in
      while (!done || events.length > 0) {
        if (events.length > 0) {
          yield events.shift();
        } else if (!done) {
          await new Promise((r) => { resolveWait = r; });
        }
      }

      await runPromise; // Ensure any errors propagate
    },

    /** Get current conversation history */
    getHistory() {
      return agentState.conversationHistory;
    },

    /** Get current todos */
    getTodos() {
      return agentState.todos;
    },

    /** Reset agent state */
    reset() {
      agentState.conversationHistory = [];
      agentState.todos = [];
      agentState.iterationCount = 0;
    },
  };
}
