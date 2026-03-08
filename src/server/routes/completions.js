import crypto from "node:crypto";
import { textCompletion } from "../../engine/inference.js";
import { modelPool } from "../../engine/pool.js";

export async function registerCompletionsRoutes(fastify) {
  fastify.post("/v1/completions", async (request, reply) => {
    const { model, prompt = "", stream = false, max_tokens: maxTokens, temperature } = request.body || {};

    if (!model) {
      return reply.code(400).send({ error: { message: "model is required", type: "invalid_request_error" } });
    }

    const poolItem = await modelPool.load(model);
    const id = `cmpl-${crypto.randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      await textCompletion({
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
      });

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return reply;
    }

    const text = await textCompletion({
      context: poolItem.context,
      prompt,
      maxTokens,
      temperature
    });

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
  });
}
