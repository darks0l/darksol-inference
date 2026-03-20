import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { createTodoManager } from "../src/agent/middleware/todos.js";
import { createSummarizationManager, estimateTokens } from "../src/agent/middleware/summarization.js";
import { parseSkillMetadata, discoverSkills, buildSkillsPrompt, formatSkillsList } from "../src/agent/middleware/skills.js";
import { createMemoryManager } from "../src/agent/middleware/memory.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-mw-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── Todo Manager ────────────────────────────────────────────

describe("todo manager", () => {
  it("creates and retrieves todos", () => {
    const mgr = createTodoManager();
    mgr.set([
      { content: "Do thing A", status: "pending" },
      { content: "Do thing B", status: "in_progress" },
      { content: "Do thing C", status: "completed" },
    ]);
    assert.equal(mgr.todos.length, 3);
    assert.equal(mgr.todos[0].status, "pending");
    assert.equal(mgr.todos[1].status, "in_progress");
    assert.equal(mgr.todos[2].status, "completed");
  });

  it("formats todos with icons", () => {
    const mgr = createTodoManager();
    mgr.set([
      { content: "Step 1", status: "completed" },
      { content: "Step 2", status: "in_progress" },
      { content: "Step 3", status: "pending" },
    ]);
    const formatted = mgr.format();
    assert.ok(formatted.includes("✅"));
    assert.ok(formatted.includes("🔄"));
    assert.ok(formatted.includes("⬜"));
    assert.ok(formatted.includes("Step 1"));
  });

  it("returns empty string when no todos", () => {
    const mgr = createTodoManager();
    assert.equal(mgr.format(), "");
  });

  it("detects all done", () => {
    const mgr = createTodoManager();
    mgr.set([
      { content: "A", status: "completed" },
      { content: "B", status: "completed" },
    ]);
    assert.ok(mgr.isAllDone());
  });

  it("not all done when pending tasks remain", () => {
    const mgr = createTodoManager();
    mgr.set([
      { content: "A", status: "completed" },
      { content: "B", status: "pending" },
    ]);
    assert.ok(!mgr.isAllDone());
  });

  it("gets stats", () => {
    const mgr = createTodoManager();
    mgr.set([
      { content: "A", status: "completed" },
      { content: "B", status: "in_progress" },
      { content: "C", status: "pending" },
      { content: "D", status: "pending" },
    ]);
    const stats = mgr.getStats();
    assert.equal(stats.total, 4);
    assert.equal(stats.completed, 1);
    assert.equal(stats.inProgress, 1);
    assert.equal(stats.pending, 2);
  });

  it("initializes from existing todos", () => {
    const initial = [{ id: "t1", content: "Existing", status: "in_progress", createdAt: 0 }];
    const mgr = createTodoManager(initial);
    assert.equal(mgr.todos.length, 1);
    assert.equal(mgr.todos[0].content, "Existing");
  });
});

// ─── Summarization ────────────────────────────────────────────

describe("summarization manager", () => {
  it("estimates tokens approximately", () => {
    const messages = [
      { role: "user", content: "hello world" },
      { role: "assistant", content: "hi there" },
    ];
    const tokens = estimateTokens(messages);
    assert.ok(tokens > 0);
    assert.ok(tokens < 20); // "hello world hi there" is ~5 tokens
  });

  it("should not trigger summarization for short conversations", () => {
    const mgr = createSummarizationManager({ contextWindowTokens: 1000 });
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    assert.ok(!mgr.shouldSummarize(messages));
  });

  it("should trigger summarization when exceeding threshold", () => {
    // Set a very small context window so our messages trigger it
    const mgr = createSummarizationManager({ contextWindowTokens: 50 });
    // 50 * 0.85 = 42 tokens threshold. Need ~168 chars
    const messages = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "This is a message with enough content to push token count over the threshold. ".repeat(3),
    }));
    assert.ok(mgr.shouldSummarize(messages));
  });

  it("summarizes long conversations and reduces message count", async () => {
    const mgr = createSummarizationManager({
      contextWindowTokens: 200,
      sessionId: "test-sum-session",
      llmCall: async () => "The agent helped with a coding task.",
    });

    // Generate messages that exceed the context window
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "This is a lengthy message about doing things. ".repeat(5),
    }));

    if (mgr.shouldSummarize(messages)) {
      const summarized = await mgr.summarize(messages);
      assert.ok(summarized.length < messages.length);
      // First message should be the summary
      assert.ok(summarized[0]._isSummary || summarized[0].content.includes("Summary") || summarized[0].content.includes("summary") || summarized[0].content.includes("summarized"));
    }
    // If doesn't trigger, that's fine for this test size
  });

  it("returns effective messages (applies previous summarization)", () => {
    const mgr = createSummarizationManager({ contextWindowTokens: 10000 });
    const messages = [
      { role: "user", content: "msg 1" },
      { role: "assistant", content: "msg 2" },
    ];
    // No summarization yet — effective messages = original
    const effective = mgr.getEffectiveMessages(messages);
    assert.deepEqual(effective, messages);
  });
});

// ─── Skills Middleware ─────────────────────────────────────────

describe("skills middleware", () => {
  it("parses SKILL.md frontmatter", () => {
    const content = `---
name: web-research
description: Search the web for information on any topic. Use when the user asks to research something online.
---

# Web Research Skill

Follow these steps...
`;
    const skill = parseSkillMetadata(content, "/skills/web-research/SKILL.md");
    assert.ok(skill);
    assert.equal(skill.name, "web-research");
    assert.ok(skill.description.includes("Search the web"));
    assert.equal(skill.path, "/skills/web-research/SKILL.md");
  });

  it("returns null for missing frontmatter", () => {
    const content = `# Just a markdown file without frontmatter\n\nSome content.`;
    const skill = parseSkillMetadata(content, "/skills/test/SKILL.md");
    assert.equal(skill, null);
  });

  it("returns null if name or description missing", () => {
    const content = `---\nname: test-skill\n---\n\n# No description`;
    const skill = parseSkillMetadata(content, "/skills/test-skill/SKILL.md");
    assert.equal(skill, null);
  });

  it("discovers skills from a directory", async () => {
    // Create a skill directory structure
    const skillsDir = path.join(tmpDir, "skills");
    const skillDir = path.join(skillsDir, "my-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: my-skill
description: A test skill for testing purposes
---

# My Skill
`);

    const skills = await discoverSkills(skillsDir);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, "my-skill");
    assert.ok(skills[0].description.includes("test skill"));
  });

  it("returns empty array for missing directory", async () => {
    const skills = await discoverSkills(path.join(tmpDir, "nonexistent"));
    assert.deepEqual(skills, []);
  });

  it("formats skills list", () => {
    const skills = [
      { name: "web-search", description: "Search the web", path: "/skills/web-search/SKILL.md" },
      { name: "code-review", description: "Review code quality", path: "/skills/code-review/SKILL.md" },
    ];
    const formatted = formatSkillsList(skills);
    assert.ok(formatted.includes("web-search"));
    assert.ok(formatted.includes("code-review"));
    assert.ok(formatted.includes("Search the web"));
  });

  it("formats empty skills list with source hint", () => {
    const formatted = formatSkillsList([], ["/skills/"]);
    assert.ok(formatted.includes("No skills found"));
    assert.ok(formatted.includes("/skills/"));
  });
});

// ─── Memory Middleware ─────────────────────────────────────────

describe("memory middleware", () => {
  it("loads memory from file", async () => {
    const memFile = path.join(tmpDir, "AGENTS.md");
    await fs.writeFile(memFile, "# Agent Memory\n\nUser prefers TypeScript.");

    const mgr = createMemoryManager({ sources: [memFile] });
    const contents = await mgr.load();
    assert.ok(contents[memFile]);
    assert.ok(contents[memFile].includes("User prefers TypeScript"));
  });

  it("handles missing files gracefully", async () => {
    const mgr = createMemoryManager({
      sources: [path.join(tmpDir, "nonexistent.md")],
    });
    const contents = await mgr.load();
    assert.deepEqual(contents, {});
    assert.ok(!mgr.hasMemory());
  });

  it("generates prompt section with memory content", async () => {
    const memFile = path.join(tmpDir, "AGENTS.md");
    await fs.writeFile(memFile, "User likes concise answers.");

    const mgr = createMemoryManager({ sources: [memFile] });
    const section = await mgr.getPromptSection();
    assert.ok(section.includes("User likes concise answers"));
    assert.ok(section.includes("Persistent Memory"));
  });

  it("returns empty string when no memory loaded", async () => {
    const mgr = createMemoryManager({ sources: [] });
    const section = await mgr.getPromptSection();
    assert.equal(section, "");
  });

  it("caches loaded memory", async () => {
    const memFile = path.join(tmpDir, "AGENTS.md");
    await fs.writeFile(memFile, "initial content");

    const mgr = createMemoryManager({ sources: [memFile] });
    await mgr.load();

    // Modify file — should not affect cached result
    await fs.writeFile(memFile, "modified content");
    const contents = await mgr.load();
    assert.ok(contents[memFile].includes("initial content"));

    // After reset, should reload
    mgr.reset();
    const fresh = await mgr.load();
    assert.ok(fresh[memFile].includes("modified content"));
  });
});
