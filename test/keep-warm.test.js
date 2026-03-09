import assert from "node:assert/strict";
import { test } from "node:test";
import { KeepWarmScheduler, normalizeKeepWarmConfig } from "../src/runtime/keep-warm.js";

test("normalizeKeepWarmConfig applies defaults", () => {
  const normalized = normalizeKeepWarmConfig({ keepWarmEnabled: true });
  assert.deepEqual(normalized, {
    keepWarmEnabled: true,
    keepWarmModel: null,
    keepWarmIntervalSec: 120
  });
});

test("KeepWarmScheduler fire sends lightweight inference ping", async () => {
  const fetchCalls = [];
  const logEvents = [];
  const scheduler = new KeepWarmScheduler({
    loadConfigFn: async () => ({
      host: "127.0.0.1",
      port: 11435,
      keepWarmEnabled: true,
      keepWarmModel: "llama-test",
      keepWarmIntervalSec: 120
    }),
    saveConfigFn: async (next) => ({
      host: "127.0.0.1",
      port: 11435,
      ...next
    }),
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, status: 200 };
    },
    loggerApi: {
      async info(message, extra) {
        logEvents.push({ message, extra });
      }
    },
    setIntervalFn: () => 1,
    clearIntervalFn() {}
  });

  await scheduler.startFromConfig({
    keepWarmEnabled: true,
    keepWarmModel: "llama-test",
    keepWarmIntervalSec: 120
  });
  const result = await scheduler.fire();

  assert.equal(result.ok, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://127.0.0.1:11435/v1/completions");
  assert.equal(logEvents[0].message, "keep_warm_fired");
  assert.equal(scheduler.getState().lastResult, "ok");
});

test("KeepWarmScheduler updateConfig persists and restarts scheduler", async () => {
  const saveCalls = [];
  let startedIntervalMs = null;
  const scheduler = new KeepWarmScheduler({
    loadConfigFn: async () => ({
      keepWarmEnabled: false,
      keepWarmModel: null,
      keepWarmIntervalSec: 120
    }),
    saveConfigFn: async (next) => {
      saveCalls.push(next);
      return next;
    },
    setIntervalFn: (_handler, ms) => {
      startedIntervalMs = ms;
      return 22;
    },
    clearIntervalFn() {},
    loggerApi: { async info() {} }
  });

  const updated = await scheduler.updateConfig({
    enabled: true,
    model: "llama-test",
    interval: 300
  });

  assert.deepEqual(saveCalls, [{
    keepWarmEnabled: true,
    keepWarmModel: "llama-test",
    keepWarmIntervalSec: 300
  }]);
  assert.equal(updated.keepWarmEnabled, true);
  assert.equal(startedIntervalMs, 300000);
});
