import { spawn } from "node:child_process";
import fs from "node:fs";
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

function getBundledCliEntrypoint() {
  if (!process.resourcesPath) {
    return null;
  }

  return path.join(process.resourcesPath, "backend", "bin", "darksol.js");
}

function isPackagedDesktopRuntime() {
  return Boolean(process.resourcesPath) && !process.defaultApp;
}

export function getBackendSpawnPlan() {
  if (process.env.DARKSOL_DESKTOP_BACKEND_CMD) {
    return { command: process.env.DARKSOL_DESKTOP_BACKEND_CMD, args: ["serve"], env: process.env };
  }

  if (process.env.DARKSOL_DESKTOP_BACKEND_NODE) {
    return {
      command: process.env.DARKSOL_DESKTOP_BACKEND_NODE,
      args: [getDevCliEntrypoint(), "serve"],
      env: process.env
    };
  }

  if (isPackagedDesktopRuntime()) {
    const bundledCliEntrypoint = getBundledCliEntrypoint();
    if (!bundledCliEntrypoint || !fs.existsSync(bundledCliEntrypoint)) {
      throw new Error(`Bundled backend entrypoint not found at ${bundledCliEntrypoint}`);
    }

    return {
      command: process.execPath,
      args: [bundledCliEntrypoint, "serve"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      }
    };
  }

  return { command: "darksol", args: ["serve"], env: process.env };
}

export function spawnBackendProcess(spawnImpl = spawn) {
  const plan = getBackendSpawnPlan();

  return spawnImpl(plan.command, plan.args, {
    env: plan.env,
    stdio: "pipe",
    windowsHide: true
  });
}
