import { detectHardware } from "../hardware/detect.js";
import { optimizeForModel } from "../hardware/optimize.js";
import { loadModelWithConfig } from "./loader.js";
import { getInstalledModel, getModelFilePath } from "../models/manager.js";

class ModelPool {
  constructor() {
    this.loaded = new Map();
  }

  async load(modelName) {
    if (this.loaded.has(modelName)) {
      const item = this.loaded.get(modelName);
      item.lastUsed = Date.now();
      return item;
    }

    const metadata = await getInstalledModel(modelName);
    if (!metadata) {
      throw new Error(`Model not installed: ${modelName}`);
    }

    const hardware = await detectHardware();
    const optimized = optimizeForModel({ hardware, modelMetadata: metadata });
    const modelPath = getModelFilePath(modelName);
    const model = await loadModelWithConfig({ modelPath, options: optimized });
    const context = await model.createContext();

    const item = {
      modelName,
      model,
      context,
      metadata,
      hardware,
      optimized,
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

  unload(modelName) {
    return this.loaded.delete(modelName);
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
