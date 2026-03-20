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
import { createTodoManager } from "./middleware/todos.js";
import { createSummarizationManager } from "./middleware/summarization.js";
import { createSkillsManager } from "./middleware/skills.js";
import { createMemoryManager } from "./middleware/memory.js";
import { createSubAgentExecutor } from "./middleware/subagents.js";

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
 * @property {boolean} [skills] - Enable skill loading (default: true)
 * @property {string[]} [skillSources] - Custom skill source paths
 * @property {boolean} [memory] - Enable AGENTS.md memory (default: true)
 * @property {string[]} [memorySources] - Custom memory file paths
 * @property {boolean} [subagents] - Enable sub-agent spawning (default: false)
 * @property {Array} [subagentSpecs] - Custom sub-agent specifications
 * @property {number} [contextWindowTokens] - Context window size for summarization
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
    skills: enableSkills = true,
    skillSources,
    memory: enableMemory = true,
    memorySources,
    subagents: enableSubagents = false,
    subagentSpecs = [],
    contextWindowTokens,
    verbose = false,
    onStep,
    onToken,
    cwd,
    signal,
  } = config;

  // Set working directory
  if (cwd) {
    try { process.chdir(cwd); } catch { /* ignore */ }
  }

  // Initialize middleware
  const todoManager = createTodoManager();

  const summarizer = createSummarizationManager({
    contextWindowTokens,
    // LLM call for summarization (wired in after init)
    llmCall: async (messages) => {
      const resp = await callLLMRaw(messages);
      return resp?.message?.content || "Summary unavailable.";
    },
  });

  const skillsManager = enableSkills ? createSkillsManager({
    sources: skillSources,
  }) : null;

  const memoryManager = enableMemory ? createMemoryManager({
    sources: memorySources,
  }) : null;

  const subagentExecutor = enableSubagents ? createSubAgentExecutor({
    subagents: subagentSpecs,
    apiBase,
    apiKey,
    model,
    maxIterations: Math.floor(maxIterations / 2), // Sub-agents get half the budget
  }) : null;

  // Shared state across the agent's lifetime
  const agentState = {
    get todos() { return todoManager.todos; },
    set todos(v) { todoManager.set(v); },
    subagentExecutor, // Exposed for tool executor
    conversationHistory: [],
    iterationCount: 0,
  };

  // Cache for middleware sections (loaded once per session)
  let _skillsSection = null;
  let _memorySection = null;
  let _middlewareLoaded = false;

  async function loadMiddlewareSections() {
    if (_middlewareLoaded) return;
    _middlewareLoaded = true;
    if (skillsManager) {
      _skillsSection = await skillsManager.getPromptSection().catch(() => "");
    }
    if (memoryManager) {
      _memorySection = await memoryManager.getPromptSection().catch(() => "");
    }
  }

  /**
   * Raw LLM call without system prompt injection (for summarization).
   * @param {Array<Object>} messages
   * @returns {Promise<Object>}
   */
  async function callLLMRaw(messages) {
    const body = {
      model: model === "auto" ? undefined : model,
      messages,
      temperature: 0.3,
      stream: false,
    };
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    try {
      const response = await fetch(`${apiBase}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      return { message: data.choices?.[0]?.message };
    } catch {
      return null;
    }
  }

  /**
   * Call the LLM via OpenAI-compatible API.
   * @param {Array<Object>} messages
   * @param {boolean} [stream=false]
   * @returns {Promise<Object>} Response with message and optional tool_calls
   */
  async function callLLM(messages, stream = false) {
    // Load middleware sections on first call
    await loadMiddlewareSections();

    // Apply summarization if needed
    const effectiveMessages = summarizer.shouldSummarize(messages)
      ? await summarizer.summarize(messages)
      : messages;

    const systemMsg = buildSystemPrompt({
      userPrompt,
      planning,
      subagents: enableSubagents,
      todos: todoManager.todos.length > 0 ? todoManager.todos : undefined,
      skillsSection: _skillsSection,
      memorySection: _memorySection,
    });

    // Build active tool list (base tools + task tool if sub-agents enabled)
    const activeTools = enableSubagents && subagentExecutor
      ? [...TOOL_DEFINITIONS, subagentExecutor.toolDefinition]
      : TOOL_DEFINITIONS;

    const fullMessages = [
      { role: "system", content: systemMsg },
      ...effectiveMessages,
    ];

    const body = {
      model: model === "auto" ? undefined : model,
      messages: fullMessages,
      tools: activeTools,
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
        todos: todoManager.todos.length > 0 ? todoManager.todos : undefined,
        iterations,
        totalTokensEstimate: estimateTokens(),
        historyPath: summarizer.getHistoryPath(),
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
      return todoManager.todos;
    },

    /** Get skills manager */
    getSkillsManager() {
      return skillsManager;
    },

    /** Get memory manager */
    getMemoryManager() {
      return memoryManager;
    },

    /** Get summarization manager */
    getSummarizationManager() {
      return summarizer;
    },

    /** Reset agent state */
    reset() {
      agentState.conversationHistory = [];
      agentState.iterationCount = 0;
      todoManager.set([]);
      summarizer.reset();
      _middlewareLoaded = false;
      _skillsSection = null;
      _memorySection = null;
    },
  };
}
