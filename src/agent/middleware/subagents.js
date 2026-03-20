/**
 * Sub-agent middleware — spawn isolated child agents for complex tasks.
 *
 * Each sub-agent gets:
 * - Its own context window (won't bloat the parent)
 * - Access to the same tools (filesystem, shell, etc.)
 * - A fresh message history (state isolation)
 * - Returns a single result when done
 *
 * Port of deepagents' createSubAgentMiddleware to vanilla Node.js.
 * Adds a `task` tool to the parent agent's tool list.
 */

import { createDarksolAgent } from "../deep-agent.js";

/**
 * @typedef {Object} SubAgentSpec
 * @property {string} name - Identifier for this sub-agent type
 * @property {string} description - Shown to parent agent for selection
 * @property {string} systemPrompt - The sub-agent's system prompt
 * @property {string} [model] - Override model for this sub-agent
 */

/** Default general-purpose sub-agent */
const GENERAL_PURPOSE_SUBAGENT = {
  name: "general-purpose",
  description: "General-purpose agent for complex, multi-step tasks. Has access to filesystem, shell, and planning tools. Best for tasks that need deep focus without cluttering the main context.",
  systemPrompt: "You are an autonomous sub-agent. Complete the assigned task thoroughly and return a clear, concise result.",
};

/**
 * Task tool description for the system prompt.
 */
export const TASK_SYSTEM_PROMPT = `## Sub-Agent System (task tool)

You can spawn sub-agents to handle complex, isolated tasks. Each sub-agent:
- Gets its own fresh context window (won't consume yours)
- Has the same tools as you (filesystem, shell, planning)
- Runs autonomously and returns ONE result
- Cannot communicate mid-task — give complete instructions

**When to use sub-agents:**
- Complex multi-step work that can be fully delegated
- Tasks you want to parallelize (launch multiple at once)
- Heavy research or analysis that would bloat your context
- Tasks where you only care about the final output

**When NOT to use:**
- Simple tasks (just do them directly)
- Tasks needing your intermediate feedback
- Fewer than 3 tool calls

**Parallel execution:** Use the task tool multiple times in one response to run sub-agents in parallel.`;

/**
 * Build the task tool definition for function calling.
 * @param {SubAgentSpec[]} subagents
 * @returns {object} OpenAI tool definition
 */
export function buildTaskToolDefinition(subagents) {
  const agentList = subagents.map((s) => `- \`${s.name}\`: ${s.description}`).join("\n");

  return {
    type: "function",
    function: {
      name: "task",
      description: `Spawn a sub-agent to handle a complex, isolated task. The sub-agent runs autonomously and returns one result.

Available sub-agent types:
${agentList}

Usage: provide a detailed task description and the sub-agent type. Be specific — the agent cannot ask follow-up questions.`,
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Detailed task description for the sub-agent. Include all context it needs to complete the task independently.",
          },
          subagent_type: {
            type: "string",
            enum: subagents.map((s) => s.name),
            description: "Type of sub-agent to spawn.",
          },
        },
        required: ["description", "subagent_type"],
      },
    },
  };
}

/**
 * Create a sub-agent executor.
 *
 * @param {object} options
 * @param {SubAgentSpec[]} [options.subagents] - Custom sub-agent specs
 * @param {string} [options.apiBase] - API base URL (inherited from parent)
 * @param {string} [options.apiKey] - API key (inherited from parent)
 * @param {string} [options.model] - Default model (inherited from parent)
 * @param {number} [options.maxIterations] - Max iterations per sub-agent (default: 30)
 * @returns {{ toolDefinition: object, execute: Function, getSystemPromptSection: Function }}
 */
export function createSubAgentExecutor(options = {}) {
  const {
    subagents: customSubagents = [],
    apiBase = "http://127.0.0.1:11435",
    apiKey,
    model = "auto",
    maxIterations = 30,
  } = options;

  // Merge general-purpose + custom sub-agents
  const allSubagents = [GENERAL_PURPOSE_SUBAGENT, ...customSubagents];

  // Build lookup map
  const subagentMap = new Map(allSubagents.map((s) => [s.name, s]));

  return {
    /** Tool definition for injection into parent's tool list */
    toolDefinition: buildTaskToolDefinition(allSubagents),

    /** System prompt section to add to parent */
    getSystemPromptSection() {
      return "\n" + TASK_SYSTEM_PROMPT;
    },

    /**
     * Execute a task tool call.
     * @param {string} subagentType - Sub-agent type name
     * @param {string} description - Task description
     * @returns {Promise<string>} Sub-agent result
     */
    async execute(subagentType, description) {
      const spec = subagentMap.get(subagentType);
      if (!spec) {
        return `Error: Unknown sub-agent type "${subagentType}". Available: ${allSubagents.map((s) => s.name).join(", ")}`;
      }

      const subAgent = createDarksolAgent({
        model: spec.model || model,
        systemPrompt: spec.systemPrompt,
        apiBase,
        apiKey,
        maxIterations,
        planning: true,
        skills: false, // Sub-agents don't inherit parent's skills
        memory: false, // Sub-agents don't inherit parent's memory
        verbose: false,
      });

      try {
        const result = await subAgent.run(description);
        let output = result.response;

        // Append todo summary if the sub-agent made a plan
        if (result.todos && result.todos.length > 0) {
          const completed = result.todos.filter((t) => t.status === "completed").length;
          output += `\n\n[Sub-agent completed ${completed}/${result.todos.length} tasks in ${result.iterations} iterations]`;
        }

        return output;
      } catch (err) {
        return `Sub-agent error: ${err.message}`;
      }
    },

    /**
     * Execute multiple tasks in parallel.
     * @param {Array<{subagentType: string, description: string}>} tasks
     * @returns {Promise<string[]>} Results in the same order as tasks
     */
    async executeParallel(tasks) {
      return Promise.all(
        tasks.map(({ subagentType, description }) => this.execute(subagentType, description))
      );
    },

    /** Get available sub-agent specs */
    getSpecs() { return allSubagents; },
  };
}

/**
 * Inject sub-agent support into an existing agent config.
 * Returns augmented tool definitions and system prompt additions.
 *
 * @param {object} baseConfig - createDarksolAgent config
 * @param {SubAgentSpec[]} [subagents] - Custom sub-agent specs
 * @returns {{ tools: object[], systemPromptAddition: string, executor: object }}
 */
export function withSubAgents(baseConfig, subagents = []) {
  const executor = createSubAgentExecutor({
    subagents,
    apiBase: baseConfig.apiBase,
    apiKey: baseConfig.apiKey,
    model: baseConfig.model,
  });

  return {
    executor,
    taskToolDefinition: executor.toolDefinition,
    systemPromptAddition: executor.getSystemPromptSection(),
  };
}
