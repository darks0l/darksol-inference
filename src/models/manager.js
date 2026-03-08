import fs from "node:fs/promises";
import { downloadModel } from "./pull.js";
import { resolveModelSpec } from "./aliases.js";
import { deleteRegistryModel, loadRegistry, setRegistryModel } from "./registry.js";
import { modelDir, modelFilePath, modelMetadataPath } from "../lib/paths.js";

export async function listInstalledModels() {
  const registry = await loadRegistry();
  return Object.values(registry.models).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInstalledModel(modelName) {
  const registry = await loadRegistry();
  return registry.models[modelName] || null;
}

export async function ensureModelInstalled(input, options = {}) {
  const spec = resolveModelSpec(input);
  const existing = await getInstalledModel(spec.localName) || await getInstalledModel(input);
  if (existing) {
    return { metadata: existing, downloaded: false, spec };
  }

  const metadata = await downloadModel({ spec, onProgress: options.onProgress });
  await setRegistryModel(spec.localName, metadata);
  return { metadata, downloaded: true, spec };
}

export async function removeModel(input) {
  const spec = resolveModelSpec(input);
  const existing = await getInstalledModel(input) || await getInstalledModel(spec.localName);
  const actualName = existing?.name || spec.localName;
  await fs.rm(modelDir(actualName), { recursive: true, force: true });
  await deleteRegistryModel(actualName);
  return actualName;
}

export async function readModelMetadata(modelName) {
  try {
    const raw = await fs.readFile(modelMetadataPath(modelName), "utf8");
    return JSON.parse(raw);
  } catch {
    const fromRegistry = await getInstalledModel(modelName);
    return fromRegistry;
  }
}

export function getModelFilePath(modelName) {
  return modelFilePath(modelName);
}
