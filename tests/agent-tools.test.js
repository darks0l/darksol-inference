import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { executeTool, TOOL_DEFINITIONS } from "../src/agent/tools.js";

let tmpDir;
const origCwd = process.cwd();

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-tools-test-"));
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("tool definitions", () => {
  it("has all expected tools", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    assert.ok(names.includes("ls"));
    assert.ok(names.includes("read_file"));
    assert.ok(names.includes("write_file"));
    assert.ok(names.includes("edit_file"));
    assert.ok(names.includes("glob"));
    assert.ok(names.includes("grep"));
    assert.ok(names.includes("execute"));
    assert.ok(names.includes("write_todos"));
  });

  it("all tools have valid schema", () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.equal(tool.type, "function");
      assert.ok(tool.function.name);
      assert.ok(tool.function.description);
      assert.ok(tool.function.parameters);
      assert.equal(tool.function.parameters.type, "object");
    }
  });
});

describe("executeTool", () => {
  it("executes ls", async () => {
    await fs.writeFile(path.join(tmpDir, "test.txt"), "hi");
    const result = await executeTool("ls", { path: tmpDir });
    assert.ok(result.includes("test.txt"));
  });

  it("executes write_file + read_file roundtrip", async () => {
    const filePath = path.join(tmpDir, "roundtrip.txt");
    const writeResult = await executeTool("write_file", { path: filePath, content: "hello agent" });
    assert.ok(writeResult.includes("Wrote"));
    const readResult = await executeTool("read_file", { path: filePath });
    assert.ok(readResult.includes("hello agent"));
  });

  it("executes edit_file", async () => {
    const filePath = path.join(tmpDir, "editable.txt");
    await fs.writeFile(filePath, "old value here");
    const result = await executeTool("edit_file", {
      path: filePath,
      old_text: "old value",
      new_text: "new value",
    });
    assert.ok(result.includes("Edited"));
    const content = await fs.readFile(filePath, "utf-8");
    assert.ok(content.includes("new value"));
  });

  it("executes write_todos", async () => {
    const state = {};
    const result = await executeTool("write_todos", {
      todos: [
        { content: "Step 1", status: "completed" },
        { content: "Step 2", status: "in_progress" },
        { content: "Step 3", status: "pending" },
      ],
    }, state);
    assert.ok(result.includes("Task list updated"));
    assert.equal(state.todos.length, 3);
    assert.equal(state.todos[0].status, "completed");
  });

  it("executes shell command", async () => {
    const result = await executeTool("execute", { command: "echo test123" });
    assert.ok(result.includes("test123"));
  });

  it("handles unknown tools gracefully", async () => {
    const result = await executeTool("nonexistent_tool", {});
    assert.ok(result.includes("Unknown tool"));
  });
});
