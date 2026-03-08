import { listInstalledModels } from "../../models/manager.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient } from "../../providers/ollama.js";
import { openAIError } from "./errors.js";

export async function registerModelsRoutes(fastify, { ollamaClient } = {}) {
  const client = ollamaClient || createOllamaClient();

  fastify.get("/v1/models", async () => {
    const installed = await listInstalledModels();
    const loadedNames = new Set(modelPool.listLoaded().map((m) => m.name));
    let ollamaModels = [];

    if (client.enabled) {
      try {
        ollamaModels = await client.listLocalModels();
      } catch {
        ollamaModels = [];
      }
    }

    return {
      object: "list",
      data: [
        ...installed.map((model) => ({
          id: model.name,
          object: "model",
          owned_by: "darksol",
          provider: "darksol",
          created: model.downloadedAt ? Math.floor(new Date(model.downloadedAt).getTime() / 1000) : 0,
          loaded: loadedNames.has(model.name)
        })),
        ...ollamaModels.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "ollama",
          provider: "ollama",
          created: model.modifiedAt ? Math.floor(new Date(model.modifiedAt).getTime() / 1000) : 0,
          loaded: false
        }))
      ]
    };
  });

  fastify.get("/v1/ollama/models", async (request, reply) => {
    if (!client.enabled) {
      return openAIError(reply, 400, "Ollama provider is disabled.", "invalid_request_error", "ollama_disabled");
    }

    try {
      const models = await client.listLocalModels();
      return {
        object: "list",
        data: models.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "ollama",
          provider: "ollama",
          created: model.modifiedAt ? Math.floor(new Date(model.modifiedAt).getTime() / 1000) : 0,
          size: model.size,
          quant: model.quant,
          family: model.family,
          parameter_size: model.parameterSize
        }))
      };
    } catch (error) {
      return openAIError(
        reply,
        error.status || 502,
        error.message || "Failed to reach Ollama.",
        "api_error",
        error.code || "ollama_error"
      );
    }
  });
}
