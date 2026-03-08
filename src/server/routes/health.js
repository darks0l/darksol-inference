import { modelPool } from "../../engine/pool.js";
import { detectHardware } from "../../hardware/detect.js";

export async function registerHealthRoutes(fastify) {
  fastify.get("/health", async () => ({
    status: "ok",
    service: "darksol-inference",
    timestamp: new Date().toISOString()
  }));

  fastify.get("/health/runtime", async () => ({
    status: "ok",
    service: "darksol-inference",
    timestamp: new Date().toISOString(),
    loadedModels: modelPool.listLoaded(),
    hardware: await detectHardware()
  }));
}
