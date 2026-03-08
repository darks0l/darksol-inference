import { detectHardware } from "../hardware/detect.js";
import { getThermalStatus } from "../hardware/thermal.js";
import { modelPool } from "../engine/pool.js";
import { loadConfig } from "../lib/config.js";

async function getRuntimeStatus(host, port, fetchImpl) {
  try {
    const runtimeResponse = await fetchImpl(`http://${host}:${port}/health/runtime`);
    if (runtimeResponse.ok) {
      const payload = typeof runtimeResponse.json === "function" ? await runtimeResponse.json() : {};
      return {
        server: "online",
        loadedModels: Array.isArray(payload?.loadedModels) ? payload.loadedModels : null,
        hardware: payload?.hardware || null
      };
    }

    const healthResponse = await fetchImpl(`http://${host}:${port}/health`);
    return {
      server: healthResponse.ok ? "online" : `error:${healthResponse.status}`,
      loadedModels: null,
      hardware: null
    };
  } catch {
    return {
      server: "offline",
      loadedModels: null,
      hardware: null
    };
  }
}

export function registerStatusCommand(program, deps = {}) {
  const loadConfigFn = deps.loadConfig || loadConfig;
  const detectHardwareFn = deps.detectHardware || detectHardware;
  const getThermalStatusFn = deps.getThermalStatus || getThermalStatus;
  const modelPoolApi = deps.modelPool || modelPool;
  const fetchImpl = deps.fetchImpl || fetch;
  const log = deps.log || console.log;

  program
    .command("status")
    .description("System status overview")
    .action(async () => {
      const [config, thermal] = await Promise.all([
        loadConfigFn(),
        getThermalStatusFn()
      ]);

      const runtimeStatus = await getRuntimeStatus(config.host, config.port, fetchImpl);
      const hardware = runtimeStatus.hardware || await detectHardwareFn();
      const loaded = runtimeStatus.loadedModels || modelPoolApi.listLoaded();

      log(`Server: ${runtimeStatus.server} (${config.host}:${config.port})`);
      log(`CPU: ${hardware.cpu.brand} (${hardware.cpu.physicalCores} cores)`);
      log(`Memory: ${(hardware.memory.free / (1024 ** 3)).toFixed(1)} GB free / ${(hardware.memory.total / (1024 ** 3)).toFixed(1)} GB total`);
      log(`GPU(s): ${hardware.gpus.map((g) => `${g.model} ${g.vramMb}MB`).join(" | ") || "none"}`);
      log(`Temperature: ${thermal.main ?? "n/a"} C`);
      log(`Loaded Models: ${loaded.length}`);
      for (const model of loaded) {
        log(`  - ${model.name} (gpu_layers=${model.gpuLayers}, threads=${model.threads})`);
      }
    });
}
