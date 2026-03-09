import { detectHardware } from "../hardware/detect.js";
import { optimizeForModel } from "../hardware/optimize.js";
import { loadModelWithConfig, resolveModelPath } from "./loader.js";
import { getInstalledModel, getModelFilePath } from "../models/manager.js";
import { resolveOllamaLocalModel } from "../providers/ollama-local.js";
import { toOllamaModelName, isOllamaModelId } from "../providers/ollama.js";

async function disposeResource(resource) {
  if (!resource) {
    return;
  }

  if (typeof resource.dispose === "function") {
    await resource.dispose();
    return;
  }

  if (typeof resource.free === "function") {
    await resource.free();
  }
}

function isLikelyCorruptOrIncompatibleError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("gguf") && message.includes("invalid") ||
    message.includes("bad magic") ||
    message.includes("unsupported model") ||
    message.includes("unknown model file type")
  );
}

export class ModelPool {
  constructor({ maxLoadedModels, maxLoadedModelBytes } = {}) {
    this.loaded = new Map();
    this.maxLoadedModels = Number(process.env.DARKSOL_MAX_LOADED_MODELS || maxLoadedModels || 1);
    this.maxLoadedModelBytes = Number(
      process.env.DARKSOL_MAX_LOADED_MODEL_BYTES || maxLoadedModelBytes || 0
    );
  }

  totalLoadedBytes() {
    let total = 0;
    for (const item of this.loaded.values()) {
      total += item.metadata?.size || 0;
    }
    return total;
  }

  async unload(modelName) {
    const item = this.loaded.get(modelName);
    if (!item) {
      return false;
    }

    this.loaded.delete(modelName);
    await disposeResource(item.context);
    await disposeResource(item.model);
    return true;
  }

  async enforceLimits(pendingModelBytes = 0) {
    const evictionCandidates = [...this.loaded.values()].sort((a, b) => a.lastUsed - b.lastUsed);

    for (const candidate of evictionCandidates) {
      const overModelCount = this.maxLoadedModels > 0 && this.loaded.size >= this.maxLoadedModels;
      const overMemoryLimit =
        this.maxLoadedModelBytes > 0 &&
        this.totalLoadedBytes() + pendingModelBytes > this.maxLoadedModelBytes;

      if (!overModelCount && !overMemoryLimit) {
        return;
      }

      await this.unload(candidate.modelName);
    }

    const stillOverModelCount = this.maxLoadedModels > 0 && this.loaded.size >= this.maxLoadedModels;
    const stillOverMemoryLimit =
      this.maxLoadedModelBytes > 0 && this.totalLoadedBytes() + pendingModelBytes > this.maxLoadedModelBytes;

    if (stillOverModelCount || stillOverMemoryLimit) {
      throw new Error("Unable to free enough model memory in pool.");
    }
  }

  async load(modelName, options = {}) {
    if (this.loaded.has(modelName)) {
      const item = this.loaded.get(modelName);
      item.lastUsed = Date.now();
      return item;
    }

    let metadata = options.metadata || await getInstalledModel(modelName);
    let resolvedModelPath = null;

    // If not in Darksol registry, check Ollama local filesystem
    if (!metadata) {
      const ollamaName = isOllamaModelId(modelName) ? toOllamaModelName(modelName) : modelName;
      const ollamaModel = await resolveOllamaLocalModel(ollamaName).catch(() => null);
      if (ollamaModel && ollamaModel.ggufPath) {
        metadata = {
          name: modelName,
          size: ollamaModel.size || 0,
          quant: ollamaModel.quant,
          family: ollamaModel.family,
          parameterSize: ollamaModel.parameterSize,
          source: "ollama-local"
        };
        resolvedModelPath = ollamaModel.ggufPath;
      }
    }

    if (!metadata) {
      throw new Error(`Model not installed: ${modelName}`);
    }

    await this.enforceLimits(metadata.size || 0);

    const modelPath = resolvedModelPath
      ? resolvedModelPath
      : await resolveModelPath(options.modelPath || getModelFilePath(modelName));
    const hardware = await detectHardware();
    const freeMemoryBytes = hardware?.memory?.free || 0;
    if (metadata.size && freeMemoryBytes > 0 && metadata.size > freeMemoryBytes * 0.95) {
      throw new Error(
        `Insufficient memory: model '${modelName}' requires ${metadata.size} bytes but only ${Math.floor(freeMemoryBytes)} bytes are free.`
      );
    }

    const optimized = optimizeForModel({ hardware, modelMetadata: metadata });
    let model;
    try {
      model = await loadModelWithConfig({ modelPath, options: optimized });
    } catch (error) {
      if (isLikelyCorruptOrIncompatibleError(error)) {
        throw new Error(`Failed to load model '${modelName}': GGUF file is corrupt or incompatible.`);
      }
      throw error;
    }
    const context = await model.createContext();

    const item = {
      modelName,
      model,
      context,
      metadata,
      hardware,
      optimized,
      modelPath,
      loadedAt: Date.now(),
      lastUsed: Date.now()
    };

    this.loaded.set(modelName, item);
    return item;
  }

  get(modelName) {
    const item = this.loaded.get(modelName);
    if (!item) {
      return null;
    }
    item.lastUsed = Date.now();
    return item;
  }

  listLoaded() {
    return [...this.loaded.values()].map((item) => ({
      name: item.modelName,
      loadedAt: new Date(item.loadedAt).toISOString(),
      lastUsed: new Date(item.lastUsed).toISOString(),
      gpuLayers: item.optimized.gpuLayers,
      threads: item.optimized.threads,
      size: item.metadata.size,
      quant: item.metadata.quant
    }));
  }
}

export const modelPool = new ModelPool();
