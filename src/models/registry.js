import fs from "node:fs/promises";
import { ensureDarksolDirs, registryPath } from "../lib/paths.js";

const emptyRegistry = { models: {} };

export async function loadRegistry() {
  await ensureDarksolDirs();
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    const data = JSON.parse(raw);
    if (!data.models) {
      data.models = {};
    }
    return data;
  } catch {
    await saveRegistry(emptyRegistry);
    return { ...emptyRegistry };
  }
}

export async function saveRegistry(registry) {
  await ensureDarksolDirs();
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

export async function setRegistryModel(modelName, metadata) {
  const registry = await loadRegistry();
  registry.models[modelName] = metadata;
  await saveRegistry(registry);
  return registry.models[modelName];
}

export async function deleteRegistryModel(modelName) {
  const registry = await loadRegistry();
  delete registry.models[modelName];
  await saveRegistry(registry);
}
