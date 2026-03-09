import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_HEALTH_TIMEOUT_MS = 45_000;
export const DEFAULT_HEALTH_POLL_INTERVAL_MS = 500;

export function getHealthUrl(apiBaseUrl) {
  return `${String(apiBaseUrl || "").replace(/\/+$/, "")}/health`;
}

export async function probeBackendHealth(apiBaseUrl, fetchImpl = fetch) {
  const healthUrl = getHealthUrl(apiBaseUrl);
  const response = await fetchImpl(healthUrl, {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    return { ok: false, status: response.status, healthUrl };
  }

  const body = await response.json();
  return { ok: body?.status === "ok", status: response.status, body, healthUrl };
}

export async function pollBackendHealth(
  apiBaseUrl,
  {
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    intervalMs = DEFAULT_HEALTH_POLL_INTERVAL_MS,
    fetchImpl = fetch,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}
) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const health = await probeBackendHealth(apiBaseUrl, fetchImpl);
      if (health.ok) {
        return { ok: true, health };
      }
      lastError = new Error(`Health probe returned HTTP ${health.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleepFn(intervalMs);
  }

  return {
    ok: false,
    timeoutMs,
    lastError
  };
}

function getDevCliEntrypoint() {
  return path.resolve(__dirname, "../../bin/darksol.js");
}

export function getBackendSpawnPlan() {
  if (process.env.DARKSOL_DESKTOP_BACKEND_CMD) {
    return { command: process.env.DARKSOL_DESKTOP_BACKEND_CMD, args: ["serve"] };
  }

  if (process.env.DARKSOL_DESKTOP_BACKEND_NODE) {
    return {
      command: process.env.DARKSOL_DESKTOP_BACKEND_NODE,
      args: [getDevCliEntrypoint(), "serve"]
    };
  }

  return { command: "darksol", args: ["serve"] };
}

export function spawnBackendProcess(spawnImpl = spawn) {
  const plan = getBackendSpawnPlan();

  return spawnImpl(plan.command, plan.args, {
    env: process.env,
    stdio: "pipe",
    windowsHide: true
  });
}
