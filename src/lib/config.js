import fs from "node:fs/promises";
import path from "node:path";
import { configPath, ensureDarksolDirs } from "./paths.js";

const defaultConfig = {
  apiKey: null,
  host: "127.0.0.1",
  port: 11435,
  defaultModel: null,
  keepAliveMs: 300000,
  inferenceConcurrency: 1,
  providerTimeoutMs: 15000,
  providerRetryCount: 1,
  ollamaEnabled: true,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  keepWarmEnabled: false,
  keepWarmModel: null,
  keepWarmIntervalSec: 120
};

function resolveConfigPath(options = {}) {
  return options.configPathOverride || configPath;
}

async function ensureConfigDir(targetPath) {
  if (targetPath === configPath) {
    await ensureDarksolDirs();
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

export async function loadConfig(options = {}) {
  const targetPath = resolveConfigPath(options);
  await ensureConfigDir(targetPath);
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return { ...defaultConfig };
  }
}

export async function saveConfig(nextConfig, options = {}) {
  const targetPath = resolveConfigPath(options);
  await ensureConfigDir(targetPath);
  const current = await loadConfig(options);
  const merged = { ...defaultConfig, ...current, ...nextConfig };
  await fs.writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}
