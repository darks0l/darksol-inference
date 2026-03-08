import crypto from "node:crypto";
import { chatCompletion } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";

export async function registerChatRoutes(fastify) {
  fastify.post("/v1/chat/completions", async (request, reply) => {
    const {
      model,
      messages = [],
      stream = false,
      max_tokens: maxTokens,
      temperature
    } = request.body || {};

    if (!model) {
      return reply.code(400).send({ error: { message: "model is required", type: "invalid_request_error" } });
    }

    const poolItem = await modelPool.load(model);
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
  });
}
