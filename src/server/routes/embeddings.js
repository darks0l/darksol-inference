import { createEmbedding } from "../../engine/embeddings.js";
import { modelPool } from "../../engine/pool.js";
import { handleRouteError, openAIError } from "./errors.js";

export async function registerEmbeddingsRoutes(fastify) {
  fastify.post("/v1/embeddings", async (request, reply) => {
    const { model, input } = request.body || {};

    if (!model) {
      return openAIError(reply, 400, "model is required", "invalid_request_error", "model_required");
    }

    if (typeof input !== "string") {
      return openAIError(reply, 400, "input must be a string", "invalid_request_error", "invalid_input");
    }

    try {
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
    } catch (error) {
      return handleRouteError(reply, error, model);
    }
  });
}
