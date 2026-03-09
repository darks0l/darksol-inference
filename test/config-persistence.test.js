import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { loadConfig, saveConfig } from "../src/lib/config.js";

const tempDirs = [];

async function createTempConfigPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-config-test-"));
  tempDirs.push(dir);
  return path.join(dir, "config.json");
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("saveConfig persists keep-warm fields and loadConfig reads them", async () => {
  const configPathOverride = await createTempConfigPath();

  await saveConfig(
    {
      keepWarmEnabled: true,
      keepWarmModel: "llama-test",
      keepWarmIntervalSec: 240
    },
    { configPathOverride }
  );

  const loaded = await loadConfig({ configPathOverride });
  assert.equal(loaded.keepWarmEnabled, true);
  assert.equal(loaded.keepWarmModel, "llama-test");
  assert.equal(loaded.keepWarmIntervalSec, 240);
});
