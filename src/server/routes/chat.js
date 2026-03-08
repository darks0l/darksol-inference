import crypto from "node:crypto";
import { chatCompletion, chatCompletionStream } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient, isOllamaModelId, toOllamaModelName } from "../../providers/ollama.js";
import { estimateMessageTokens, estimateTokens, recordInferenceUsage } from "../../lib/cost-tracker.js";
import { handleRouteError, isModelNotInstalledError, openAIError } from "./errors.js";
import { createProviderInvoker, createRequestQueue } from "../inference-controls.js";
import { createMcpRegistry } from "../../mcp/registry.js";
import { createMcpExecutor } from "../../mcp/executor.js";
import { buildOpenAITools, hasEnabledTools } from "../../mcp/tool-injector.js";

function setupSse(reply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  if (typeof reply.raw.flushHeaders === "function") {
    reply.raw.flushHeaders();
  }
}

function writeSse(reply, payload) {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createRequestAbortSignal(rawRequest) {
  const controller = new AbortController();
  rawRequest.on("close", () => controller.abort(new Error("client_disconnected")));
  return controller.signal;
}

async function safelyRecordUsage(recordInferenceUsageFn, usage) {
  try {
    await recordInferenceUsageFn(usage);
  } catch {
    // Usage tracking must never break inference responses.
  }
}

async function respondFromOllama({
  reply,
  request,
  client,
  model,
  messages,
  stream,
  invokeProvider,
  estimateTokensFn,
  estimateMessageTokensFn,
  recordInferenceUsageFn,
  mcp
}) {
  const ollamaModel = isOllamaModelId(model) ? toOllamaModelName(model) : model;
  const apiModelId = isOllamaModelId(model) ? model : `ollama/${model}`;
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const promptTokens = estimateMessageTokensFn(messages);
  const hasMcpTools = !stream && mcp?.enabled && hasEnabledTools(mcp.servers);
  const injectedTools = hasMcpTools ? buildOpenAITools(mcp.servers) : [];

  if (stream) {
    setupSse(reply);
    const signal = createRequestAbortSignal(request.raw);
    let generated = "";

    await invokeProvider(
      () =>
        client.chat({
          model: ollamaModel,
          messages,
          stream: true,
          signal,
          onTextChunk: (chunk) => {
            generated += chunk;
            const payload = {
              id,
              object: "chat.completion.chunk",
              created,
              model: apiModelId,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
            };
            writeSse(reply, payload);
          }
        }),
      { allowRetry: false }
    );

    await safelyRecordUsage(recordInferenceUsageFn, {
      provider: "ollama",
      tokensIn: promptTokens,
      tokensOut: estimateTokensFn(generated)
    });

    const donePayload = {
      id,
      object: "chat.completion.chunk",
      created,
      model: apiModelId,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    };
    writeSse(reply, donePayload);
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
    return reply;
  }

  let finalContent = "";
  let completionMessage = null;

  if (hasMcpTools) {
    const conversation = [...messages];
    const maxToolRounds = mcp.maxToolRounds || 6;

    for (let round = 0; round < maxToolRounds; round += 1) {
      completionMessage = await invokeProvider(() =>
        client.chat({
          model: ollamaModel,
          messages: conversation,
          stream: false,
          tools: injectedTools,
          returnMessage: true
        })
      );

      const toolCalls = Array.isArray(completionMessage?.tool_calls) ? completionMessage.tool_calls : [];
      if (toolCalls.length === 0) {
        finalContent = completionMessage?.content || "";
        break;
      }

      conversation.push({
        role: completionMessage.role || "assistant",
        content: completionMessage.content || "",
        tool_calls: toolCalls
      });

      for (const toolCall of toolCalls) {
        const toolResult = await mcp.executor.executeToolCall({ toolCall, servers: mcp.servers });
        conversation.push(toolResult.toolMessage);
      }
    }
  } else {
    finalContent = await invokeProvider(() =>
      client.chat({
        model: ollamaModel,
        messages,
        stream: false
      })
    );
  }

  const text = finalContent || completionMessage?.content || "";
  const completionTokens = estimateTokensFn(text);

  await safelyRecordUsage(recordInferenceUsageFn, {
    provider: "ollama",
    tokensIn: promptTokens,
    tokensOut: completionTokens
  });

  return {
    id,
    object: "chat.completion",
    created,
    model: apiModelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  };
}

export async function registerChatRoutes(
  fastify,
  {
    ollamaClient,
    requestQueue,
    providerInvoker,
    estimateTokensFn,
    estimateMessageTokensFn,
    recordInferenceUsageFn,
    mcpRegistry,
    mcpExecutor
  } = {}
) {
  const client = ollamaClient || createOllamaClient();
  const queue = requestQueue || createRequestQueue();
  const invokeProvider = providerInvoker || createProviderInvoker();
  const estimateTokensImpl = estimateTokensFn || estimateTokens;
  const estimateMessageTokensImpl = estimateMessageTokensFn || estimateMessageTokens;
  const recordUsageImpl = recordInferenceUsageFn || recordInferenceUsage;
  const registry = mcpRegistry || createMcpRegistry();
  const executor = mcpExecutor || createMcpExecutor();

  fastify.post("/v1/chat/completions", async (request, reply) => {
    return queue.enqueue(async () => {
      const {
        model,
        messages = [],
        stream = false,
        max_tokens: maxTokens,
        temperature
      } = request.body || {};

      if (!model) {
        return openAIError(reply, 400, "model is required", "invalid_request_error", "model_required");
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        return openAIError(
          reply,
          400,
          "messages must be a non-empty array",
          "invalid_request_error",
          "invalid_messages"
        );
      }

      try {
        let mcpServers = [];
        try {
          mcpServers = await registry.list();
        } catch {
          mcpServers = [];
        }
        const mcpContext = {
          enabled: true,
          servers: mcpServers,
          executor,
          maxToolRounds: 6
        };

        if (isOllamaModelId(model)) {
          return await respondFromOllama({
            reply,
            request,
            client,
            model,
            messages,
            stream,
            invokeProvider,
            estimateTokensFn: estimateTokensImpl,
            estimateMessageTokensFn: estimateMessageTokensImpl,
            recordInferenceUsageFn: recordUsageImpl,
            mcp: mcpContext
          });
        }

        let poolItem;
        try {
          poolItem = await modelPool.load(model);
        } catch (error) {
          if (client.enabled && isModelNotInstalledError(error)) {
            return await respondFromOllama({
              reply,
              request,
              client,
              model,
              messages,
              stream,
              invokeProvider,
              estimateTokensFn: estimateTokensImpl,
              estimateMessageTokensFn: estimateMessageTokensImpl,
              recordInferenceUsageFn: recordUsageImpl,
              mcp: mcpContext
            });
          }
          throw error;
        }

        const id = `chatcmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);

        if (stream) {
          setupSse(reply);
          const signal = createRequestAbortSignal(request.raw);
          let generated = "";

          await invokeProvider(
            async () => {
              for await (const chunk of chatCompletionStream({
                context: poolItem.context,
                messages,
                maxTokens,
                temperature,
                signal
              })) {
                generated += chunk;
                const payload = {
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
                };
                writeSse(reply, payload);
              }
            },
            { allowRetry: false }
          );

          await safelyRecordUsage(recordUsageImpl, {
            provider: "local",
            tokensIn: estimateMessageTokensImpl(messages),
            tokensOut: estimateTokensImpl(generated)
          });

          const donePayload = {
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          };
          writeSse(reply, donePayload);
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
          return reply;
        }

        const text = await invokeProvider(() =>
          chatCompletion({
            context: poolItem.context,
            messages,
            maxTokens,
            temperature
          })
        );
        const promptTokens = estimateMessageTokensImpl(messages);
        const completionTokens = estimateTokensImpl(text);

        await safelyRecordUsage(recordUsageImpl, {
          provider: "local",
          tokensIn: promptTokens,
          tokensOut: completionTokens
        });

        return {
          id,
          object: "chat.completion",
          created,
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          }
        };
      } catch (error) {
        return handleRouteError(reply, error, model);
      }
    });
  });
}
