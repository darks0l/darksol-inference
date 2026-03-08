import { resolveModelSpec } from "../models/aliases.js";
import { getInstalledModel, getModelFilePath } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";
import { discoverOllamaLocalModels, resolveOllamaLocalModel } from "../providers/ollama-local.js";

export function registerInfoCommand(program, deps = {}) {
  const resolveModelSpecFn = deps.resolveModelSpec || resolveModelSpec;
  const getInstalledModelFn = deps.getInstalledModel || getInstalledModel;
  const getModelFilePathFn = deps.getModelFilePath || getModelFilePath;
  const discoverOllamaLocalModelsFn = deps.discoverOllamaLocalModels || discoverOllamaLocalModels;
  const resolveOllamaLocalModelFn = deps.resolveOllamaLocalModel || resolveOllamaLocalModel;
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
      const localMetadata = await getInstalledModelFn(spec.localName) || await getInstalledModelFn(model);
      const ollamaRequestedModel = String(model).replace(/^ollama\//, "");
      const ollamaModels = await discoverOllamaLocalModelsFn().catch(() => []);
      const ollamaMetadata = await resolveOllamaLocalModelFn(ollamaRequestedModel, { models: ollamaModels });

      if (!localMetadata && !ollamaMetadata) {
        errorLog(`Model not installed: ${model}`);
        setExitCode(1);
        return;
      }

      const metadata = localMetadata || {
        name: `ollama/${ollamaMetadata.name}`,
        repo: "ollama/local",
        file: ollamaMetadata.ggufPath,
        filePath: ollamaMetadata.ggufPath,
        size: ollamaMetadata.size,
        quant: ollamaMetadata.quant,
        family: ollamaMetadata.family,
        parameterSize: ollamaMetadata.parameterSize,
        downloadedAt: ollamaMetadata.modifiedAt
      };
      const loaded = modelPoolApi.get(metadata.name) || modelPoolApi.get(model);

      log(`Name: ${metadata.name}`);
      log(`Repo: ${metadata.repo}`);
      log(`File: ${metadata.file}`);
      const ggufPath = metadata.filePath || (localMetadata ? getModelFilePathFn(metadata.name) : null);
      if (ggufPath) {
        log(`GGUF Path: ${ggufPath}`);
      }
      log(`Size: ${formatBytes(metadata.size)}`);
      log(`Quant: ${metadata.quant || "unknown"}`);
      log(`Family: ${metadata.family || "unknown"}`);
      log(`Parameters: ${metadata.parameterSize || "unknown"}`);
      log(`Downloaded: ${metadata.downloadedAt}`);
      log(`Loaded: ${loaded ? "yes" : "no"}`);
      if (loaded) {
        log(`GPU Layers: ${loaded.optimized.gpuLayers}`);
        log(`Threads: ${loaded.optimized.threads}`);
        log(`Context: ${loaded.optimized.contextSize}`);
      }
    });
}
