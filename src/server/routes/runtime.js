import { getRuntimeManager } from "../../runtime/manager.js";
import { getKeepWarmScheduler } from "../../runtime/keep-warm.js";
import { loadConfig, saveConfig } from "../../lib/config.js";
import { findAvailablePort, isPortAvailable, isValidPort } from "../../runtime/ports.js";

export async function registerRuntimeRoutes(fastify, deps = {}) {
  const runtimeManager = deps.runtimeManager || getRuntimeManager();
  const keepWarmScheduler = deps.keepWarmScheduler || getKeepWarmScheduler();
  const loadConfigFn = deps.loadConfigFn || loadConfig;
  const saveConfigFn = deps.saveConfigFn || saveConfig;

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

  fastify.get("/v1/runtime/ports", async (request) => {
    const config = await loadConfigFn();
    const requestedPort = Number(request.query?.port || config.port);
    const requestedHost = String(request.query?.host || config.host || "127.0.0.1");

    const status = await isPortAvailable(requestedPort, requestedHost);
    return {
      runtime: "Darksol Engine",
      host: requestedHost,
      port: requestedPort,
      available: status.available
    };
  });

  fastify.post("/v1/runtime/ports/find", async (request, reply) => {
    const config = await loadConfigFn();
    const startPort = Number(request.body?.startPort || config.port || 11435);
    const host = String(request.body?.host || config.host || "127.0.0.1");

    if (!isValidPort(startPort)) {
      return reply.code(400).send({ error: "invalid_start_port" });
    }

    const freePort = await findAvailablePort({ startPort, host, maxAttempts: 100 });
    return {
      runtime: "Darksol Engine",
      host,
      port: freePort,
      available: true
    };
  });

  fastify.post("/v1/runtime/config", async (request, reply) => {
    const current = await loadConfigFn();
    const body = request.body || {};

    const host = typeof body.host === "string" ? body.host.trim() : current.host;
    const requestedPort = body.findFreePort
      ? await findAvailablePort({ startPort: Number(body.port || current.port), host, maxAttempts: 100 })
      : Number(body.port ?? current.port);

    if (!isValidPort(requestedPort)) {
      return reply.code(400).send({ error: "invalid_port" });
    }

    const saved = await saveConfigFn({ host, port: requestedPort });
    return {
      ok: true,
      runtime: "Darksol Engine",
      config: {
        host: saved.host,
        port: saved.port
      }
    };
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
