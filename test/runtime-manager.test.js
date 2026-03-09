import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  DarksolEngineRuntimeManager,
  isProcessAlive,
  pollRuntimeHealth,
  readPidFile,
  removePidFile,
  writePidFile
} from "../src/runtime/manager.js";

const tempDirs = [];

async function createTempPath(fileName) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-runtime-test-"));
  tempDirs.push(dir);
  return path.join(dir, fileName);
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("pid helper read/write/remove roundtrip", async () => {
  const pidPath = await createTempPath("darksol.pid");
  await writePidFile({ owner: "darksol-runtime-manager", pid: 1234 }, pidPath);

  const pidEntry = await readPidFile(pidPath);
  assert.equal(pidEntry.pid, 1234);

  await removePidFile(pidPath);
  const missing = await readPidFile(pidPath);
  assert.equal(missing, null);
});

test("isProcessAlive recognizes current process", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(-1), false);
});

test("pollRuntimeHealth succeeds after transient failures", async () => {
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
        return { status: "ok", loadedModels: [{ name: "llama-test" }] };
      }
    };
  };

  const result = await pollRuntimeHealth(
    { host: "127.0.0.1", port: 11435 },
    { timeoutMs: 500, intervalMs: 1, fetchImpl }
  );

  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
});

test("runtime manager start returns running status when Darksol Engine already healthy", async () => {
  let spawnCalls = 0;
  const manager = new DarksolEngineRuntimeManager({
    pidFilePath: await createTempPath("darksol.pid"),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { status: "ok", loadedModels: [{ name: "llama-test" }] };
      }
    }),
    spawnImpl: () => {
      spawnCalls += 1;
      return { pid: process.pid, unref() {} };
    },
    loadConfigFn: async () => ({ host: "127.0.0.1", port: 11435 }),
    setIntervalFn: () => 1,
    clearIntervalFn() {}
  });

  const status = await manager.start();
  assert.equal(spawnCalls, 0);
  assert.equal(status.status, "running");
  assert.equal(status.loadedModelsCount, 1);
});
