import { createEmbedding } from "../../engine/embeddings.js";
import { modelPool } from "../../engine/pool.js";
import { handleRouteError, openAIError } from "./errors.js";

function normalizeEmbeddingInput(input) {
  if (typeof input === "string") {
    return [input];
  }

  if (Array.isArray(input) && input.every((item) => typeof item === "string")) {
    return input;
  }

  return null;
}

export async function registerEmbeddingsRoutes(fastify, deps = {}) {
  const modelPoolApi = deps.modelPool || modelPool;
  const createEmbeddingFn = deps.createEmbedding || createEmbedding;

  fastify.post("/v1/embeddings", async (request, reply) => {
    const { model, input } = request.body || {};
    const normalizedInput = normalizeEmbeddingInput(input);

    if (!model) {
      return openAIError(reply, 400, "model is required", "invalid_request_error", "model_required");
    }

    if (input === undefined || input === null) {
      return openAIError(reply, 400, "input is required", "invalid_request_error", "input_required");
    }

    if (!normalizedInput || normalizedInput.length === 0) {
      return openAIError(
        reply,
        400,
        "input must be a string or string array",
        "invalid_request_error",
        "invalid_input"
      );
    }

    try {
      const poolItem = await modelPoolApi.load(model);
      const data = [];

      for (let index = 0; index < normalizedInput.length; index += 1) {
        const value = normalizedInput[index];
        const embedding = await createEmbeddingFn({ model: poolItem.model, input: value });
        data.push({
          object: "embedding",
          embedding,
          index
        });
      }

      return {
        object: "list",
        data,
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
