import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ls, readFile, writeFile, editFile, glob, grep } from "../src/agent/backends/filesystem.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-agent-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("filesystem backend", () => {

  describe("ls", () => {
    it("lists directory contents", async () => {
      await fs.writeFile(path.join(tmpDir, "hello.txt"), "world");
      await fs.mkdir(path.join(tmpDir, "subdir"));
      const result = await ls(tmpDir);
      assert.ok(!result.error);
      assert.ok(result.content.includes("hello.txt"));
      assert.ok(result.content.includes("subdir"));
    });

    it("returns error for missing directory", async () => {
      const result = await ls(path.join(tmpDir, "nope"));
      assert.ok(result.error);
    });
  });

  describe("readFile", () => {
    it("reads file with line numbers", async () => {
      const content = "line one\nline two\nline three\n";
      await fs.writeFile(path.join(tmpDir, "test.txt"), content);
      const result = await readFile(path.join(tmpDir, "test.txt"));
      assert.ok(!result.error);
      assert.ok(result.content.includes("line one"));
      assert.ok(result.content.includes("line two"));
      assert.ok(result.content.includes("│"));
    });

    it("supports pagination", async () => {
      const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n");
      await fs.writeFile(path.join(tmpDir, "big.txt"), lines);
      const result = await readFile(path.join(tmpDir, "big.txt"), 0, 10);
      assert.ok(!result.error);
      assert.ok(result.content.includes("line 1"));
      assert.ok(result.content.includes("line 10"));
      assert.ok(result.content.includes("more lines"));
    });

    it("returns error for missing file", async () => {
      const result = await readFile(path.join(tmpDir, "nope.txt"));
      assert.ok(result.error);
      assert.ok(result.error.includes("not found"));
    });

    it("returns error for directories", async () => {
      const result = await readFile(tmpDir);
      assert.ok(result.error);
      assert.ok(result.error.includes("directory"));
    });
  });

  describe("writeFile", () => {
    it("creates a new file", async () => {
      const result = await writeFile(path.join(tmpDir, "new.txt"), "hello world");
      assert.ok(!result.error);
      assert.ok(result.content.includes("Wrote"));
      const content = await fs.readFile(path.join(tmpDir, "new.txt"), "utf-8");
      assert.equal(content, "hello world");
    });

    it("creates parent directories", async () => {
      const filePath = path.join(tmpDir, "a", "b", "c", "deep.txt");
      const result = await writeFile(filePath, "deep content");
      assert.ok(!result.error);
      const content = await fs.readFile(filePath, "utf-8");
      assert.equal(content, "deep content");
    });
  });

  describe("editFile", () => {
    it("replaces exact text", async () => {
      const filePath = path.join(tmpDir, "edit.txt");
      await fs.writeFile(filePath, "hello world\ngoodbye world");
      const result = await editFile(filePath, "hello world", "hi world");
      assert.ok(!result.error);
      assert.ok(result.content.includes("Edited"));
      const content = await fs.readFile(filePath, "utf-8");
      assert.equal(content, "hi world\ngoodbye world");
    });

    it("fails if text not found", async () => {
      const filePath = path.join(tmpDir, "edit2.txt");
      await fs.writeFile(filePath, "hello world");
      const result = await editFile(filePath, "not here", "replaced");
      assert.ok(result.error);
      assert.ok(result.error.includes("not found"));
    });

    it("fails if text matches multiple times", async () => {
      const filePath = path.join(tmpDir, "edit3.txt");
      await fs.writeFile(filePath, "hello hello hello");
      const result = await editFile(filePath, "hello", "hi");
      assert.ok(result.error);
      assert.ok(result.error.includes("3 times"));
    });
  });

  describe("glob", () => {
    it("finds files matching pattern", async () => {
      await fs.writeFile(path.join(tmpDir, "a.js"), "");
      await fs.writeFile(path.join(tmpDir, "b.js"), "");
      await fs.writeFile(path.join(tmpDir, "c.txt"), "");
      const result = await glob("*.js", tmpDir);
      assert.ok(!result.error);
      assert.ok(result.content.includes("a.js"));
      assert.ok(result.content.includes("b.js"));
      assert.ok(!result.content.includes("c.txt"));
    });

    it("returns no matches message", async () => {
      const result = await glob("*.xyz", tmpDir);
      assert.ok(result.content.includes("No files matched"));
    });
  });

  describe("grep", () => {
    it("finds text in files", async () => {
      await fs.writeFile(path.join(tmpDir, "search.txt"), "the quick brown fox\njumps over the lazy dog");
      const result = await grep("brown", tmpDir);
      assert.ok(!result.error);
      assert.ok(result.content.includes("brown fox"));
    });

    it("supports case-insensitive search", async () => {
      await fs.writeFile(path.join(tmpDir, "case.txt"), "Hello World");
      const result = await grep("hello", tmpDir, { caseSensitive: false });
      assert.ok(!result.error);
      assert.ok(result.content.includes("Hello World"));
    });

    it("returns no matches message", async () => {
      await fs.writeFile(path.join(tmpDir, "empty.txt"), "nothing here");
      const result = await grep("zzzzz", tmpDir);
      assert.ok(result.content.includes("No matches"));
    });
  });
});
