import crypto from "node:crypto";
import { chatCompletion, chatCompletionStream } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient, isOllamaModelId, toOllamaModelName } from "../../providers/ollama.js";
import { handleRouteError, isModelNotInstalledError, openAIError } from "./errors.js";
import { createProviderInvoker, createRequestQueue } from "../inference-controls.js";

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

async function respondFromOllama({ reply, request, client, model, messages, stream, invokeProvider }) {
  const ollamaModel = isOllamaModelId(model) ? toOllamaModelName(model) : model;
  const apiModelId = isOllamaModelId(model) ? model : `ollama/${model}`;
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    setupSse(reply);
    const signal = createRequestAbortSignal(request.raw);

    await invokeProvider(
      () =>
        client.chat({
          model: ollamaModel,
          messages,
          stream: true,
          signal,
          onTextChunk: (chunk) => {
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

  const text = await invokeProvider(() =>
    client.chat({
      model: ollamaModel,
      messages,
      stream: false
    })
  );

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
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

export async function registerChatRoutes(fastify, { ollamaClient, requestQueue, providerInvoker } = {}) {
  const client = ollamaClient || createOllamaClient();
  const queue = requestQueue || createRequestQueue();
  const invokeProvider = providerInvoker || createProviderInvoker();

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
        if (isOllamaModelId(model)) {
          return await respondFromOllama({ reply, request, client, model, messages, stream, invokeProvider });
        }

        let poolItem;
        try {
          poolItem = await modelPool.load(model);
        } catch (error) {
          if (client.enabled && isModelNotInstalledError(error)) {
            return await respondFromOllama({ reply, request, client, model, messages, stream, invokeProvider });
          }
          throw error;
        }

        const id = `chatcmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);

        if (stream) {
          setupSse(reply);
          const signal = createRequestAbortSignal(request.raw);

          await invokeProvider(
            async () => {
              for await (const chunk of chatCompletionStream({
                context: poolItem.context,
                messages,
                maxTokens,
                temperature,
                signal
              })) {
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
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        };
      } catch (error) {
        return handleRouteError(reply, error, model);
      }
    });
  });
}
