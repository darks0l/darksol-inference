import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const home = os.homedir();

export const darksolRoot = path.join(home, ".darksol");
export const configPath = path.join(darksolRoot, "config.json");
export const modelsRoot = path.join(darksolRoot, "models");
export const registryPath = path.join(modelsRoot, "registry.json");
export const logsRoot = path.join(darksolRoot, "logs");

export async function ensureDarksolDirs() {
  await fs.mkdir(darksolRoot, { recursive: true });
  await fs.mkdir(modelsRoot, { recursive: true });
  await fs.mkdir(logsRoot, { recursive: true });
}

export function modelDir(modelName) {
  return path.join(modelsRoot, modelName);
}

export function modelFilePath(modelName) {
  return path.join(modelDir(modelName), "model.gguf");
}

export function modelMetadataPath(modelName) {
  return path.join(modelDir(modelName), "metadata.json");
}
