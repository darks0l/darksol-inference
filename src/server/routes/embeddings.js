import { createEmbedding } from "../../engine/embeddings.js";
import { modelPool } from "../../engine/pool.js";

export async function registerEmbeddingsRoutes(fastify) {
  fastify.post("/v1/embeddings", async (request, reply) => {
    const { model, input } = request.body || {};

    if (!model) {
      return reply.code(400).send({ error: { message: "model is required", type: "invalid_request_error" } });
    }

    if (typeof input !== "string") {
      return reply.code(400).send({ error: { message: "input must be a string", type: "invalid_request_error" } });
    }

    const poolItem = await modelPool.load(model);
    const embedding = await createEmbedding({ model: poolItem.model, input });

    return {
      object: "list",
      data: [
        {
          object: "embedding",
          embedding,
          index: 0
        }
      ],
      model,
      usage: {
        prompt_tokens: 0,
        total_tokens: 0
      }
    };
  });
}
