import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  estimateMessageTokens,
  estimateTokens,
  readUsageStats,
  recordInferenceUsage
} from "../src/lib/cost-tracker.js";

test("cost tracker records runs and token totals with zero local cost", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-usage-"));
  const usageFilePath = path.join(tempRoot, "usage.json");

  try {
    const first = await recordInferenceUsage(
      {
        provider: "local",
        tokensIn: 10,
        tokensOut: 15
      },
      { usageFilePath }
    );

    assert.equal(first.total_runs, 1);
    assert.equal(first.total_tokens, 25);
    assert.equal(first.total_cost, 0);

    const second = await recordInferenceUsage(
      {
        provider: "ollama",
        tokensIn: 5,
        tokensOut: 7
      },
      { usageFilePath }
    );

    assert.equal(second.total_runs, 2);
    assert.equal(second.total_tokens_in, 15);
    assert.equal(second.total_tokens_out, 22);
    assert.equal(second.total_tokens, 37);
    assert.equal(second.total_cost, 0);

    const stored = await readUsageStats({ usageFilePath });
    assert.deepEqual(stored, second);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("cost tracker token estimators are deterministic", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcdefgh"), 2);

  const messageTokens = estimateMessageTokens([
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" }
  ]);
  assert.equal(messageTokens, 4);
});
