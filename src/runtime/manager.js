import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import { darksolPidPath } from "../lib/paths.js";
import { ensureDarksolDirs } from "../lib/paths.js";
import { loadConfig } from "../lib/config.js";

export const DEFAULT_HEALTH_TIMEOUT_MS = 45_000;
export const DEFAULT_HEALTH_POLL_INTERVAL_MS = 1_000;
export const PID_FILE_OWNER = "darksol-runtime-manager";

export function getRuntimeHealthUrl({ host = "127.0.0.1", port = 11435 } = {}) {
  return `http://${host}:${port}/health/runtime`;
}

export async function probeRuntimeHealth(runtimeAddress, fetchImpl = fetch) {
  const url = getRuntimeHealthUrl(runtimeAddress);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    return { ok: false, status: response.status, url };
  }

  const body = await response.json();
  const loadedModels = Array.isArray(body?.loadedModels) ? body.loadedModels : [];
  return {
    ok: body?.status === "ok",
    status: response.status,
    loadedModelsCount: loadedModels.length,
    body,
    url
  };
}

export async function pollRuntimeHealth(
  runtimeAddress,
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
      const health = await probeRuntimeHealth(runtimeAddress, fetchImpl);
      if (health.ok) {
        return { ok: true, health };
      }
      lastError = new Error(`Health probe returned HTTP ${health.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleepFn(intervalMs);
  }

  return { ok: false, timeoutMs, lastError };
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readPidFile(pidFilePath = darksolPidPath) {
  try {
    const raw = await fs.readFile(pidFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Number.isInteger(parsed?.pid)) {
      return parsed;
    }
  } catch {
    // no-op
  }

  return null;
}

export async function writePidFile(payload, pidFilePath = darksolPidPath) {
  await ensureDarksolDirs();
  await fs.writeFile(pidFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function removePidFile(pidFilePath = darksolPidPath) {
  try {
    await fs.unlink(pidFilePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function buildServeArgs({ host, port, apiKey, ollamaBaseUrl, ollamaEnabled }) {
  const args = ["serve", "--host", String(host), "--port", String(port)];

  if (apiKey) {
    args.push("--api-key", String(apiKey));
  }
  if (typeof ollamaBaseUrl === "string" && ollamaBaseUrl.trim()) {
    args.push("--ollama-base-url", ollamaBaseUrl.trim());
  }
  if (typeof ollamaEnabled === "boolean") {
    args.push("--ollama-enabled", String(ollamaEnabled));
  }

  return args;
}

function getSpawnPlan(args) {
  if (process.env.DARKSOL_RUNTIME_CMD) {
    return { command: process.env.DARKSOL_RUNTIME_CMD, args };
  }

  return { command: "darksol", args };
}

function toUptimeSec(startedAtIso, nowMs) {
  const startedAtMs = Date.parse(startedAtIso || "");
  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const diff = Math.max(0, nowMs - startedAtMs);
  return Math.floor(diff / 1000);
}

export class DarksolEngineRuntimeManager {
  constructor({
    pidFilePath = darksolPidPath,
    fetchImpl = fetch,
    spawnImpl = spawn,
    loadConfigFn = loadConfig,
    nowFn = () => Date.now(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    healthPollIntervalMs = DEFAULT_HEALTH_POLL_INTERVAL_MS
  } = {}) {
    this.pidFilePath = pidFilePath;
    this.fetchImpl = fetchImpl;
    this.spawnImpl = spawnImpl;
    this.loadConfigFn = loadConfigFn;
    this.nowFn = nowFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.sleepFn = sleepFn;
    this.healthPollIntervalMs = healthPollIntervalMs;

    this.healthPollTimer = null;
    this.lastHealth = null;
  }

  async start(options = {}) {
    const config = await this.loadConfigFn();
    const runtimeAddress = {
      host: options.host || config.host || "127.0.0.1",
      port: Number(options.port || config.port || 11435)
    };

    try {
      const existingHealth = await probeRuntimeHealth(runtimeAddress, this.fetchImpl);
      if (existingHealth.ok) {
        this.lastHealth = {
          ok: true,
          checkedAt: new Date(this.nowFn()).toISOString(),
          loadedModelsCount: existingHealth.loadedModelsCount
        };
        await this.startHealthPolling(runtimeAddress);
        return this.getStatus({ runtimeAddress });
      }
    } catch {
      // no-op
    }

    const existingPidEntry = await readPidFile(this.pidFilePath);
    if (existingPidEntry?.owner === PID_FILE_OWNER && isProcessAlive(existingPidEntry.pid)) {
      await this.startHealthPolling(runtimeAddress);
      return this.getStatus({ runtimeAddress });
    }

    if (existingPidEntry && !isProcessAlive(existingPidEntry.pid)) {
      await removePidFile(this.pidFilePath);
    }

    const args = buildServeArgs({
      host: runtimeAddress.host,
      port: runtimeAddress.port,
      apiKey: options.apiKey === undefined ? config.apiKey : options.apiKey,
      ollamaBaseUrl: options.ollamaBaseUrl === undefined ? config.ollamaBaseUrl : options.ollamaBaseUrl,
      ollamaEnabled: options.ollamaEnabled === undefined ? config.ollamaEnabled : options.ollamaEnabled
    });
    const plan = getSpawnPlan(args);
    const child = this.spawnImpl(plan.command, plan.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: process.env
    });

    child.unref();

    const startedAt = new Date(this.nowFn()).toISOString();
    await writePidFile(
      {
        owner: PID_FILE_OWNER,
        pid: child.pid,
        startedAt,
        host: runtimeAddress.host,
        port: runtimeAddress.port
      },
      this.pidFilePath
    );

    const healthResult = await pollRuntimeHealth(runtimeAddress, {
      timeoutMs: options.healthTimeoutMs || DEFAULT_HEALTH_TIMEOUT_MS,
      intervalMs: this.healthPollIntervalMs,
      fetchImpl: this.fetchImpl,
      sleepFn: this.sleepFn
    });

    if (!healthResult.ok) {
      await removePidFile(this.pidFilePath);
      throw new Error(`Darksol Engine failed to start: ${healthResult.lastError?.message || "startup timeout"}`);
    }

    this.lastHealth = {
      ok: true,
      checkedAt: new Date(this.nowFn()).toISOString(),
      loadedModelsCount: healthResult.health.loadedModelsCount
    };

    await this.startHealthPolling(runtimeAddress);
    return this.getStatus({ runtimeAddress });
  }

  async stop({ signal = "SIGTERM", timeoutMs = 15_000, selfTerminateDelayMs = 0 } = {}) {
    const pidEntry = await readPidFile(this.pidFilePath);
    if (!pidEntry) {
      await this.stopHealthPolling();
      return this.getStoppedStatus();
    }

    if (pidEntry.owner !== PID_FILE_OWNER) {
      return this.getStoppedStatus();
    }

    if (!isProcessAlive(pidEntry.pid)) {
      await removePidFile(this.pidFilePath);
      await this.stopHealthPolling();
      return this.getStoppedStatus();
    }

    const isSelf = pidEntry.pid === process.pid;
    if (isSelf && selfTerminateDelayMs > 0) {
      setTimeout(() => {
        try {
          process.kill(pidEntry.pid, signal);
        } catch {
          // no-op
        }
      }, selfTerminateDelayMs);
      await removePidFile(this.pidFilePath);
      await this.stopHealthPolling();
      return this.getStoppedStatus();
    }

    process.kill(pidEntry.pid, signal);

    const startWait = this.nowFn();
    while (this.nowFn() - startWait < timeoutMs) {
      if (!isProcessAlive(pidEntry.pid)) {
        break;
      }
      await this.sleepFn(Math.min(250, this.healthPollIntervalMs));
    }

    await removePidFile(this.pidFilePath);
    await this.stopHealthPolling();
    return this.getStoppedStatus();
  }

  async restart(options = {}) {
    await this.stop(options.stopOptions || {});
    return this.start(options.startOptions || {});
  }

  async refreshHealth(runtimeAddress) {
    try {
      const health = await probeRuntimeHealth(runtimeAddress, this.fetchImpl);
      this.lastHealth = {
        ok: health.ok,
        checkedAt: new Date(this.nowFn()).toISOString(),
        loadedModelsCount: health.loadedModelsCount || 0
      };
    } catch (error) {
      this.lastHealth = {
        ok: false,
        checkedAt: new Date(this.nowFn()).toISOString(),
        loadedModelsCount: 0,
        error: error.message
      };
    }
  }

  async startHealthPolling(runtimeAddress) {
    await this.stopHealthPolling();
    await this.refreshHealth(runtimeAddress);

    this.healthPollTimer = this.setIntervalFn(() => {
      this.refreshHealth(runtimeAddress).catch(() => {
        // no-op
      });
    }, this.healthPollIntervalMs);
  }

  async stopHealthPolling() {
    if (this.healthPollTimer) {
      this.clearIntervalFn(this.healthPollTimer);
      this.healthPollTimer = null;
    }
  }

  getStoppedStatus() {
    return {
      status: "stopped",
      running: false,
      pid: null,
      uptimeSec: null,
      host: null,
      port: null,
      loadedModelsCount: 0,
      health: this.lastHealth
    };
  }

  async getStatus({ runtimeAddress } = {}) {
    const pidEntry = await readPidFile(this.pidFilePath);
    if (!pidEntry || pidEntry.owner !== PID_FILE_OWNER || !isProcessAlive(pidEntry.pid)) {
      if (runtimeAddress) {
        await this.refreshHealth(runtimeAddress);
        if (this.lastHealth?.ok) {
          return {
            status: "running",
            running: true,
            pid: null,
            uptimeSec: null,
            host: runtimeAddress.host,
            port: runtimeAddress.port,
            loadedModelsCount: this.lastHealth.loadedModelsCount || 0,
            health: this.lastHealth
          };
        }
      }
      return this.getStoppedStatus();
    }

    const resolvedRuntimeAddress = runtimeAddress || {
      host: pidEntry.host || "127.0.0.1",
      port: Number(pidEntry.port || 11435)
    };

    await this.refreshHealth(resolvedRuntimeAddress);

    return {
      status: "running",
      running: true,
      pid: pidEntry.pid,
      uptimeSec: toUptimeSec(pidEntry.startedAt, this.nowFn()),
      host: resolvedRuntimeAddress.host,
      port: resolvedRuntimeAddress.port,
      loadedModelsCount: this.lastHealth?.loadedModelsCount || 0,
      health: this.lastHealth
    };
  }
}

let singletonRuntimeManager;

export function getRuntimeManager() {
  if (!singletonRuntimeManager) {
    singletonRuntimeManager = new DarksolEngineRuntimeManager();
  }
  return singletonRuntimeManager;
}
