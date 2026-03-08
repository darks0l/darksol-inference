import { getLlama } from "node-llama-cpp";

let llamaInstance;

export async function getLlamaInstance() {
  if (!llamaInstance) {
    llamaInstance = await getLlama();
  }
  return llamaInstance;
}

export async function loadModelWithConfig({ modelPath, options = {} }) {
  const llama = await getLlamaInstance();
  return llama.loadModel({
    modelPath,
    gpuLayers: options.gpuLayers,
    threads: options.threads,
    batchSize: options.batchSize,
    flashAttention: options.flashAttention,
    contextSize: options.contextSize
  });
}
