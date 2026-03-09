import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getBackendSpawnPlan,
  getHealthUrl,
  pollBackendHealth,
  probeBackendHealth,
  spawnBackendProcess
} from "../desktop/src/backend.js";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
});

test("getHealthUrl normalizes trailing slash", () => {
  assert.equal(getHealthUrl("http://127.0.0.1:11435/"), "http://127.0.0.1:11435/health");
});

test("probeBackendHealth returns ok=true when health route is healthy", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { status: "ok" };
    }
  });

  const result = await probeBackendHealth("http://127.0.0.1:11435", fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.healthUrl, "http://127.0.0.1:11435/health");
});

test("pollBackendHealth resolves when health eventually returns ok", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("offline");
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { status: "ok" };
      }
    };
  };

  const result = await pollBackendHealth("http://127.0.0.1:11435", {
    timeoutMs: 1_000,
    intervalMs: 1,
    fetchImpl
  });

  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
});

test("pollBackendHealth returns timeout details when backend never becomes healthy", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };

  const result = await pollBackendHealth("http://127.0.0.1:11435", {
    timeoutMs: 20,
    intervalMs: 1,
    fetchImpl
  });

  assert.equal(result.ok, false);
  assert.equal(result.timeoutMs, 20);
  assert.match(result.lastError.message, /offline/);
});

test("getBackendSpawnPlan prefers explicit command override", () => {
  process.env.DARKSOL_DESKTOP_BACKEND_CMD = "darksol-local";
  const plan = getBackendSpawnPlan();
  assert.equal(plan.command, "darksol-local");
  assert.deepEqual(plan.args, ["serve"]);
  assert.equal(plan.env, process.env);
});

test("spawnBackendProcess uses resolved command and serve arg", () => {
  process.env.DARKSOL_DESKTOP_BACKEND_CMD = "darksol-custom";
  let invocation;
  spawnBackendProcess((command, args, options) => {
    invocation = { command, args, options };
    return {};
  });

  assert.equal(invocation.command, "darksol-custom");
  assert.deepEqual(invocation.args, ["serve"]);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.stdio, "pipe");
});
