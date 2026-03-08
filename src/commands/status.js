import { detectHardware } from "../hardware/detect.js";
import { getThermalStatus } from "../hardware/thermal.js";
import { modelPool } from "../engine/pool.js";
import { loadConfig } from "../lib/config.js";

async function getServerStatus(host, port) {
  try {
    const res = await fetch(`http://${host}:${port}/health`);
    return res.ok ? "online" : `error:${res.status}`;
  } catch {
    return "offline";
  }
}

export function registerStatusCommand(program) {
  program
    .command("status")
    .description("System status overview")
    .action(async () => {
      const [config, hardware, thermal] = await Promise.all([
        loadConfig(),
        detectHardware(),
        getThermalStatus()
      ]);

      const server = await getServerStatus(config.host, config.port);
      const loaded = modelPool.listLoaded();

      console.log(`Server: ${server} (${config.host}:${config.port})`);
      console.log(`CPU: ${hardware.cpu.brand} (${hardware.cpu.physicalCores} cores)`);
      console.log(`Memory: ${(hardware.memory.free / (1024 ** 3)).toFixed(1)} GB free / ${(hardware.memory.total / (1024 ** 3)).toFixed(1)} GB total`);
      console.log(`GPU(s): ${hardware.gpus.map((g) => `${g.model} ${g.vramMb}MB`).join(" | ") || "none"}`);
      console.log(`Temperature: ${thermal.main ?? "n/a"} C`);
      console.log(`Loaded Models: ${loaded.length}`);
      for (const model of loaded) {
        console.log(`  - ${model.name} (gpu_layers=${model.gpuLayers}, threads=${model.threads})`);
      }
    });
}
