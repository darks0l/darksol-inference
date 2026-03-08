import { resolveModelSpec } from "../models/aliases.js";
import { getInstalledModel } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerInfoCommand(program) {
  program
    .command("info")
    .description("Show model metadata")
    .argument("<model>", "model alias or local name")
    .action(async (model) => {
      const spec = resolveModelSpec(model);
      const metadata = await getInstalledModel(spec.localName) || await getInstalledModel(model);

      if (!metadata) {
        console.error(`Model not installed: ${model}`);
        process.exitCode = 1;
        return;
      }

      const loaded = modelPool.get(metadata.name);

      console.log(`Name: ${metadata.name}`);
      console.log(`Repo: ${metadata.repo}`);
      console.log(`File: ${metadata.file}`);
      console.log(`Size: ${formatBytes(metadata.size)}`);
      console.log(`Quant: ${metadata.quant || "unknown"}`);
      console.log(`Downloaded: ${metadata.downloadedAt}`);
      console.log(`Loaded: ${loaded ? "yes" : "no"}`);
      if (loaded) {
        console.log(`GPU Layers: ${loaded.optimized.gpuLayers}`);
        console.log(`Threads: ${loaded.optimized.threads}`);
        console.log(`Context: ${loaded.optimized.contextSize}`);
      }
    });
}
