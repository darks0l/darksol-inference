import fs from "node:fs/promises";
import { configPath, ensureDarksolDirs } from "./paths.js";

const defaultConfig = {
  apiKey: null,
  host: "127.0.0.1",
  port: 11435,
  defaultModel: null,
  keepAliveMs: 300000
};

export async function loadConfig() {
  await ensureDarksolDirs();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return { ...defaultConfig };
  }
}

export async function saveConfig(nextConfig) {
  await ensureDarksolDirs();
  const merged = { ...defaultConfig, ...nextConfig };
  await fs.writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}
