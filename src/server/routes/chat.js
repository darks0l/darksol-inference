import crypto from "node:crypto";
import { chatCompletion } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient, isOllamaModelId, toOllamaModelName } from "../../providers/ollama.js";
import { handleRouteError, isModelNotInstalledError, openAIError } from "./errors.js";

async function respondFromOllama({ reply, client, model, messages, stream }) {
  const ollamaModel = isOllamaModelId(model) ? toOllamaModelName(model) : model;
  const apiModelId = isOllamaModelId(model) ? model : `ollama/${model}`;
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    await client.chat({
      model: ollamaModel,
      messages,
      stream: true,
      onTextChunk: (chunk) => {
        const payload = {
          id,
          object: "chat.completion.chunk",
          created,
          model: apiModelId,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
        };
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    });

    const donePayload = {
      id,
      object: "chat.completion.chunk",
      created,
      model: apiModelId,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    };
    reply.raw.write(`data: ${JSON.stringify(donePayload)}\n\n`);
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
    return reply;
  }

  const text = await client.chat({
    model: ollamaModel,
    messages,
    stream: false
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
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

export async function registerChatRoutes(fastify, { ollamaClient } = {}) {
  const client = ollamaClient || createOllamaClient();

  fastify.post("/v1/chat/completions", async (request, reply) => {
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
        return await respondFromOllama({ reply, client, model, messages, stream });
      }

      let poolItem;
      try {
        poolItem = await modelPool.load(model);
      } catch (error) {
        if (client.enabled && isModelNotInstalledError(error)) {
          return await respondFromOllama({ reply, client, model, messages, stream });
        }
        throw error;
      }

      const id = `chatcmpl-${crypto.randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);

      if (stream) {
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });

        await chatCompletion({
          context: poolItem.context,
          messages,
          stream: true,
          maxTokens,
          temperature,
          onTextChunk: (chunk) => {
            const payload = {
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
            };
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        });

        const donePayload = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
        };
        reply.raw.write(`data: ${JSON.stringify(donePayload)}\n\n`);
        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
        return reply;
      }

      const text = await chatCompletion({
        context: poolItem.context,
        messages,
        maxTokens,
        temperature
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
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } catch (error) {
      return handleRouteError(reply, error, model);
    }
  });
}
