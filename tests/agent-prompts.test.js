import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, BASE_SYSTEM_PROMPT, PLANNING_PROMPT } from "../src/agent/prompts.js";

describe("agent prompts", () => {

  it("builds base prompt", () => {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes("Deep Agent"));
    assert.ok(prompt.includes("Filesystem Tools"));
    assert.ok(prompt.includes("Shell"));
  });

  it("includes planning by default", () => {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.includes("write_todos"));
  });

  it("excludes planning when disabled", () => {
    const prompt = buildSystemPrompt({ planning: false });
    // Planning section should not be included, but the tool might still be mentioned in base prompt
    assert.ok(!prompt.includes("Todo states:"));
  });

  it("includes custom user prompt", () => {
    const prompt = buildSystemPrompt({ userPrompt: "You are a pirate." });
    assert.ok(prompt.startsWith("You are a pirate."));
  });

  it("includes todos when provided", () => {
    const prompt = buildSystemPrompt({
      todos: [
        { content: "Build the thing", status: "in_progress" },
        { content: "Test the thing", status: "pending" },
      ],
    });
    assert.ok(prompt.includes("Build the thing"));
    assert.ok(prompt.includes("🔄"));
    assert.ok(prompt.includes("⬜"));
  });

  it("includes skills section when provided", () => {
    const prompt = buildSystemPrompt({
      skillsSection: "## Skills\n- web-search: Search the web",
    });
    assert.ok(prompt.includes("web-search"));
  });

  it("includes memory section when provided", () => {
    const prompt = buildSystemPrompt({
      memorySection: "## Memory\nUser prefers TypeScript",
    });
    assert.ok(prompt.includes("User prefers TypeScript"));
  });
});
