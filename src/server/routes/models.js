import { listInstalledModels } from "../../models/manager.js";
import { modelPool } from "../../engine/pool.js";

export async function registerModelsRoutes(fastify) {
  fastify.get("/v1/models", async () => {
    const installed = await listInstalledModels();
    const loadedNames = new Set(modelPool.listLoaded().map((m) => m.name));

    return {
      object: "list",
      data: installed.map((model) => ({
        id: model.name,
        object: "model",
        owned_by: "darksol",
        created: model.downloadedAt ? Math.floor(new Date(model.downloadedAt).getTime() / 1000) : 0,
        loaded: loadedNames.has(model.name)
      }))
    };
  });
}
