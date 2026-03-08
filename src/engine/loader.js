import { getLlama } from "node-llama-cpp";
import fs from "node:fs/promises";
import path from "node:path";
import { modelsRoot, modelDir, modelFilePath } from "../lib/paths.js";

let llamaInstance;

export async function getLlamaInstance() {
  if (!llamaInstance) {
    llamaInstance = await getLlama();
  }
  return llamaInstance;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function pickGgufFromDirectory(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const ggufFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gguf"))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((a, b) => a.localeCompare(b));

  return ggufFiles[0] || null;
}

export async function resolveModelPath(inputModelNameOrPath) {
  if (!inputModelNameOrPath || typeof inputModelNameOrPath !== "string") {
    throw new Error("Model name is required.");
  }

  const directPath = path.resolve(inputModelNameOrPath);
  if (await pathExists(directPath)) {
    const stats = await fs.stat(directPath);
    if (stats.isFile()) {
      if (!directPath.toLowerCase().endsWith(".gguf")) {
        throw new Error(`Model file must end with .gguf: ${directPath}`);
      }
      return directPath;
    }

    const nested = await pickGgufFromDirectory(directPath);
    if (nested) {
      return nested;
    }
  }

  const fixedModelFile = modelFilePath(inputModelNameOrPath);
  if (await pathExists(fixedModelFile)) {
    return fixedModelFile;
  }

  const namedDirectory = modelDir(inputModelNameOrPath);
  if (await pathExists(namedDirectory)) {
    const nested = await pickGgufFromDirectory(namedDirectory);
    if (nested) {
      return nested;
    }
  }

  const rootJoined = path.join(modelsRoot, inputModelNameOrPath);
  if (await pathExists(rootJoined)) {
    const stats = await fs.stat(rootJoined);
    if (stats.isFile() && rootJoined.toLowerCase().endsWith(".gguf")) {
      return rootJoined;
    }
    if (stats.isDirectory()) {
      const nested = await pickGgufFromDirectory(rootJoined);
      if (nested) {
        return nested;
      }
    }
  }

  throw new Error(
    `No GGUF file found for '${inputModelNameOrPath}'. Checked '${fixedModelFile}' and '${namedDirectory}' in '${modelsRoot}'.`
  );
}

export async function loadModelWithConfig({ modelPath, options = {} }) {
  const resolvedModelPath = await resolveModelPath(modelPath);
  const llama = await getLlamaInstance();

  return llama.loadModel({
    modelPath: resolvedModelPath,
    gpuLayers: options.gpuLayers,
    threads: options.threads,
    batchSize: options.batchSize,
    flashAttention: options.flashAttention,
    contextSize: options.contextSize
  });
}
