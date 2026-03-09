import { getRuntimeManager } from "../../runtime/manager.js";
import { getKeepWarmScheduler } from "../../runtime/keep-warm.js";
import { loadConfig } from "../../lib/config.js";

export async function registerRuntimeRoutes(fastify, deps = {}) {
  const runtimeManager = deps.runtimeManager || getRuntimeManager();
  const keepWarmScheduler = deps.keepWarmScheduler || getKeepWarmScheduler();
  const loadConfigFn = deps.loadConfigFn || loadConfig;

  fastify.get("/v1/runtime/status", async () => {
    const config = await loadConfigFn();
    const engine = await runtimeManager.getStatus({
      runtimeAddress: {
        host: config.host,
        port: config.port
      }
    });
    const keepWarm = keepWarmScheduler.getState();
    return {
      runtime: "Darksol Engine",
      compatibilityRuntime: "Ollama (optional)",
      engine,
      keepWarm
    };
  });

  fastify.post("/v1/runtime/start", async () => {
    const config = await loadConfigFn();
    const engine = await runtimeManager.start({
      host: config.host,
      port: config.port,
      apiKey: config.apiKey,
      ollamaEnabled: config.ollamaEnabled,
      ollamaBaseUrl: config.ollamaBaseUrl
    });
    return { ok: true, runtime: "Darksol Engine", engine };
  });

  fastify.post("/v1/runtime/stop", async () => {
    const engine = await runtimeManager.stop({ selfTerminateDelayMs: 150 });
    await keepWarmScheduler.stop();
    return { ok: true, runtime: "Darksol Engine", engine };
  });

  fastify.post("/v1/runtime/restart", async () => {
    const config = await loadConfigFn();
    const engine = await runtimeManager.restart({
      stopOptions: { selfTerminateDelayMs: 150 },
      startOptions: {
        host: config.host,
        port: config.port,
        apiKey: config.apiKey,
        ollamaEnabled: config.ollamaEnabled,
        ollamaBaseUrl: config.ollamaBaseUrl
      }
    });
    return { ok: true, runtime: "Darksol Engine", engine };
  });

  fastify.get("/v1/runtime/keepwarm", async () => {
    const config = await keepWarmScheduler.getConfig();
    return {
      runtime: "Darksol Engine",
      keepWarm: {
        enabled: config.keepWarmEnabled,
        model: config.keepWarmModel,
        intervalSec: config.keepWarmIntervalSec,
        ...keepWarmScheduler.getState()
      }
    };
  });

  fastify.post("/v1/runtime/keepwarm", async (request) => {
    const body = request.body || {};
    const updated = await keepWarmScheduler.updateConfig({
      enabled: body.enabled,
      model: body.model,
      interval: body.interval
    });
    return {
      ok: true,
      runtime: "Darksol Engine",
      keepWarm: {
        enabled: updated.keepWarmEnabled,
        model: updated.keepWarmModel,
        intervalSec: updated.keepWarmIntervalSec,
        ...keepWarmScheduler.getState()
      }
    };
  });
}
