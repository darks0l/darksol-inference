import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskToolDefinition,
  createSubAgentExecutor,
  TASK_SYSTEM_PROMPT,
} from "../src/agent/middleware/subagents.js";

describe("sub-agent middleware", () => {

  describe("buildTaskToolDefinition", () => {
    it("creates a valid task tool definition", () => {
      const subagents = [
        { name: "general-purpose", description: "General purpose agent" },
        { name: "researcher", description: "Research agent" },
      ];
      const tool = buildTaskToolDefinition(subagents);

      assert.equal(tool.type, "function");
      assert.equal(tool.function.name, "task");
      assert.ok(tool.function.description.includes("general-purpose"));
      assert.ok(tool.function.description.includes("researcher"));

      const schema = tool.function.parameters;
      assert.equal(schema.type, "object");
      assert.ok(schema.required.includes("description"));
      assert.ok(schema.required.includes("subagent_type"));
      assert.deepEqual(schema.properties.subagent_type.enum, ["general-purpose", "researcher"]);
    });

    it("includes all required fields", () => {
      const tool = buildTaskToolDefinition([{ name: "worker", description: "A worker" }]);
      assert.ok(tool.function.parameters.properties.description);
      assert.ok(tool.function.parameters.properties.subagent_type);
    });
  });

  describe("createSubAgentExecutor", () => {
    it("always includes general-purpose agent", () => {
      const executor = createSubAgentExecutor();
      const specs = executor.getSpecs();
      assert.ok(specs.some((s) => s.name === "general-purpose"));
    });

    it("includes custom sub-agents", () => {
      const executor = createSubAgentExecutor({
        subagents: [
          { name: "researcher", description: "Does research", systemPrompt: "You research things." },
        ],
      });
      const specs = executor.getSpecs();
      assert.ok(specs.some((s) => s.name === "general-purpose"));
      assert.ok(specs.some((s) => s.name === "researcher"));
    });

    it("returns error for unknown sub-agent type", async () => {
      const executor = createSubAgentExecutor({
        apiBase: "http://127.0.0.1:19999", // Non-existent
        maxIterations: 1,
      });
      const result = await executor.execute("nonexistent", "do something");
      assert.ok(result.includes("Unknown sub-agent type"));
    });

    it("task tool definition is valid OpenAI schema", () => {
      const executor = createSubAgentExecutor();
      const def = executor.toolDefinition;
      assert.equal(def.type, "function");
      assert.equal(def.function.name, "task");
      assert.ok(def.function.parameters.properties.description);
      assert.ok(def.function.parameters.properties.subagent_type);
    });

    it("gets system prompt section", () => {
      const executor = createSubAgentExecutor();
      const section = executor.getSystemPromptSection();
      assert.ok(section.includes("Sub-Agent"));
      assert.ok(section.includes("task tool"));
    });
  });

  describe("TASK_SYSTEM_PROMPT", () => {
    it("contains key guidance", () => {
      assert.ok(TASK_SYSTEM_PROMPT.includes("context window"));
      assert.ok(TASK_SYSTEM_PROMPT.includes("parallel"));
      assert.ok(TASK_SYSTEM_PROMPT.includes("When to use"));
      assert.ok(TASK_SYSTEM_PROMPT.includes("When NOT to use"));
    });
  });
});
