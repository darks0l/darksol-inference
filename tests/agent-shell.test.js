import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/agent/backends/shell.js";

describe("shell backend", () => {

  it("runs a simple command", async () => {
    const result = await execute("echo hello world");
    assert.ok(!result.error);
    assert.ok(result.content.includes("hello world"));
  });

  it("captures exit code", async () => {
    const result = await execute("exit 42");
    assert.ok(result.content.includes("Exit code 42") || result.content.includes("42"));
  });

  it("respects timeout", async () => {
    // Use a command that sleeps briefly; timeout is very short
    const isWin = process.platform === "win32";
    const cmd = isWin ? "ping -n 10 127.0.0.1" : "sleep 10";
    const result = await execute(cmd, { timeoutMs: 500 });
    assert.ok(result.error);
    assert.ok(result.error.includes("timed out"));
  });

  it("blocks dangerous commands", async () => {
    const result = await execute("rm -rf /");
    assert.ok(result.error);
    assert.ok(result.error.includes("Blocked"));
  });

  it("respects cwd option", async () => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cd" : "pwd";
    const result = await execute(cmd, { cwd: process.env.HOME || process.env.USERPROFILE });
    assert.ok(!result.error);
  });
});
