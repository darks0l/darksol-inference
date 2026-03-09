import { loadConfig, saveConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

export const DEFAULT_KEEP_WARM_INTERVAL_SEC = 120;

function normalizeInterval(intervalSec) {
  const parsed = Number(intervalSec);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_KEEP_WARM_INTERVAL_SEC;
  }
  return Math.floor(parsed);
}

export function normalizeKeepWarmConfig(rawConfig = {}) {
  return {
    keepWarmEnabled: Boolean(rawConfig.keepWarmEnabled),
    keepWarmModel: rawConfig.keepWarmModel ? String(rawConfig.keepWarmModel) : null,
    keepWarmIntervalSec: normalizeInterval(rawConfig.keepWarmIntervalSec)
  };
}

export class KeepWarmScheduler {
  constructor({
    fetchImpl = fetch,
    loadConfigFn = loadConfig,
    saveConfigFn = saveConfig,
    loggerApi = logger,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.loadConfigFn = loadConfigFn;
    this.saveConfigFn = saveConfigFn;
    this.loggerApi = loggerApi;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;

    this.intervalRef = null;
    this.inFlight = false;
    this.state = {
      active: false,
      keepWarmEnabled: false,
      keepWarmModel: null,
      keepWarmIntervalSec: DEFAULT_KEEP_WARM_INTERVAL_SEC,
      lastFiredAt: null,
      lastResult: "never"
    };
  }

  async getConfig() {
    const config = await this.loadConfigFn();
    return normalizeKeepWarmConfig(config);
  }

  async updateConfig({ enabled, model, interval } = {}) {
    const current = await this.loadConfigFn();
    const next = {
      keepWarmEnabled: enabled === undefined ? current.keepWarmEnabled : Boolean(enabled),
      keepWarmModel: model === undefined ? current.keepWarmModel : model || null,
      keepWarmIntervalSec:
        interval === undefined ? current.keepWarmIntervalSec : normalizeInterval(interval)
    };

    const saved = await this.saveConfigFn(next);
    await this.startFromConfig(saved);
    return normalizeKeepWarmConfig(saved);
  }

  async startFromConfig(configOverride) {
    const config = normalizeKeepWarmConfig(configOverride || await this.loadConfigFn());
    this.state.keepWarmEnabled = config.keepWarmEnabled;
    this.state.keepWarmModel = config.keepWarmModel;
    this.state.keepWarmIntervalSec = config.keepWarmIntervalSec;

    await this.stop();

    if (!config.keepWarmEnabled) {
      this.state.active = false;
      return this.getState();
    }

    this.state.active = true;
    this.intervalRef = this.setIntervalFn(() => {
      this.fire().catch(() => {
        // keep-warm is best-effort and must never throw in timer callback.
      });
    }, config.keepWarmIntervalSec * 1000);

    return this.getState();
  }

  async stop() {
    if (this.intervalRef) {
      this.clearIntervalFn(this.intervalRef);
      this.intervalRef = null;
    }
    this.state.active = false;
  }

  getState() {
    return { ...this.state };
  }

  async fire() {
    if (!this.state.keepWarmEnabled || !this.state.keepWarmModel || this.inFlight) {
      return { skipped: true };
    }

    this.inFlight = true;
    const firedAt = new Date().toISOString();
    this.state.lastFiredAt = firedAt;

    await this.loggerApi.info("keep_warm_fired", {
      runtime: "darksol_engine",
      model: this.state.keepWarmModel,
      intervalSec: this.state.keepWarmIntervalSec,
      firedAt
    });

    try {
      const config = await this.loadConfigFn();
      const url = `http://${config.host}:${config.port}/v1/completions`;

      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.state.keepWarmModel,
          prompt: ".",
          max_tokens: 1,
          temperature: 0
        })
      });

      this.state.lastResult = response.ok ? "ok" : `error:${response.status}`;
      return { ok: response.ok, status: response.status };
    } catch (error) {
      this.state.lastResult = `error:${error.message}`;
      return { ok: false, error: error.message };
    } finally {
      this.inFlight = false;
    }
  }
}

let singletonKeepWarmScheduler;

export function getKeepWarmScheduler() {
  if (!singletonKeepWarmScheduler) {
    singletonKeepWarmScheduler = new KeepWarmScheduler();
  }
  return singletonKeepWarmScheduler;
}
