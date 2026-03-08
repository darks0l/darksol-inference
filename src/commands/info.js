import { resolveModelSpec } from "../models/aliases.js";
import { getInstalledModel } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerInfoCommand(program, deps = {}) {
  const resolveModelSpecFn = deps.resolveModelSpec || resolveModelSpec;
  const getInstalledModelFn = deps.getInstalledModel || getInstalledModel;
  const modelPoolApi = deps.modelPool || modelPool;
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  program
    .command("info")
    .description("Show model metadata")
    .argument("<model>", "model alias or local name")
    .action(async (model) => {
      const spec = resolveModelSpecFn(model);
      const metadata = await getInstalledModelFn(spec.localName) || await getInstalledModelFn(model);

      if (!metadata) {
        errorLog(`Model not installed: ${model}`);
        setExitCode(1);
        return;
      }

      const loaded = modelPoolApi.get(metadata.name);

      log(`Name: ${metadata.name}`);
      log(`Repo: ${metadata.repo}`);
      log(`File: ${metadata.file}`);
      log(`Size: ${formatBytes(metadata.size)}`);
      log(`Quant: ${metadata.quant || "unknown"}`);
      log(`Downloaded: ${metadata.downloadedAt}`);
      log(`Loaded: ${loaded ? "yes" : "no"}`);
      if (loaded) {
        log(`GPU Layers: ${loaded.optimized.gpuLayers}`);
        log(`Threads: ${loaded.optimized.threads}`);
        log(`Context: ${loaded.optimized.contextSize}`);
      }
    });
}
