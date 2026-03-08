import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("inference pool reports a graceful error when GGUF model file is missing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-inference-smoke-"));
  const modelsDir = path.join(tempRoot, "models");
  const registryPath = path.join(modelsDir, "registry.json");
  const previousModelsDir = process.env.DARKSOL_MODELS_DIR;

  await fs.mkdir(modelsDir, { recursive: true });
  await fs.writeFile(
    registryPath,
    `${JSON.stringify(
      {
        models: {
          "missing-test": {
            name: "missing-test",
            size: 1024,
            quant: "Q4_K_M",
            downloadedAt: "2026-03-08T00:00:00.000Z"
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  process.env.DARKSOL_MODELS_DIR = modelsDir;

  try {
    const { ModelPool } = await import(`../src/engine/pool.js?smoke=${Date.now()}`);
    const pool = new ModelPool({ maxLoadedModels: 1 });

    await assert.rejects(
      pool.load("missing-test"),
      /No GGUF file found/
    );
  } finally {
    if (previousModelsDir === undefined) {
      delete process.env.DARKSOL_MODELS_DIR;
    } else {
      process.env.DARKSOL_MODELS_DIR = previousModelsDir;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
