import crypto from "node:crypto";
import { textCompletion } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient, isOllamaModelId, toOllamaModelName } from "../../providers/ollama.js";
import { handleRouteError, isModelNotInstalledError, openAIError } from "./errors.js";
import { createProviderInvoker, createRequestQueue } from "../inference-controls.js";

async function respondFromOllama({ reply, client, model, prompt, stream, invokeProvider }) {
  const ollamaModel = isOllamaModelId(model) ? toOllamaModelName(model) : model;
  const apiModelId = isOllamaModelId(model) ? model : `ollama/${model}`;
  const id = `cmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    await invokeProvider(
      () =>
        client.generate({
          model: ollamaModel,
          prompt,
          stream: true,
          onTextChunk: (chunk) => {
            const payload = {
              id,
              object: "text_completion",
              created,
              model: apiModelId,
              choices: [{ index: 0, text: chunk, finish_reason: null }]
            };
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        }),
      { allowRetry: false }
    );

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
    return reply;
  }

  const text = await invokeProvider(() =>
    client.generate({
      model: ollamaModel,
      prompt,
      stream: false
    })
  );

  return {
    id,
    object: "text_completion",
    created,
    model: apiModelId,
    choices: [{ index: 0, text, finish_reason: "stop" }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

export async function registerCompletionsRoutes(
  fastify,
  { ollamaClient, requestQueue, providerInvoker } = {}
) {
  const client = ollamaClient || createOllamaClient();
  const queue = requestQueue || createRequestQueue();
  const invokeProvider = providerInvoker || createProviderInvoker();

  fastify.post("/v1/completions", async (request, reply) => {
    return queue.enqueue(async () => {
      const { model, prompt = "", stream = false, max_tokens: maxTokens, temperature } = request.body || {};

      if (!model) {
        return openAIError(reply, 400, "model is required", "invalid_request_error", "model_required");
      }

      if (typeof prompt !== "string") {
        return openAIError(reply, 400, "prompt must be a string", "invalid_request_error", "invalid_prompt");
      }

      try {
        if (isOllamaModelId(model)) {
          return await respondFromOllama({ reply, client, model, prompt, stream, invokeProvider });
        }

        let poolItem;
        try {
          poolItem = await modelPool.load(model);
        } catch (error) {
          if (client.enabled && isModelNotInstalledError(error)) {
            return await respondFromOllama({ reply, client, model, prompt, stream, invokeProvider });
          }
          throw error;
        }

        const id = `cmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);

        if (stream) {
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          });

          await invokeProvider(
            () =>
              textCompletion({
                context: poolItem.context,
                prompt,
                stream: true,
                maxTokens,
                temperature,
                onTextChunk: (chunk) => {
                  const payload = {
                    id,
                    object: "text_completion",
                    created,
                    model,
                    choices: [{ index: 0, text: chunk, finish_reason: null }]
                  };
                  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
                }
              }),
            { allowRetry: false }
          );

          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
          return reply;
        }

        const text = await invokeProvider(() =>
          textCompletion({
            context: poolItem.context,
            prompt,
            maxTokens,
            temperature
          })
        );

        return {
          id,
          object: "text_completion",
          created,
          model,
          choices: [{ index: 0, text, finish_reason: "stop" }],
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
