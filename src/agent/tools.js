/**
 * Tool definitions and executor for the Deep Agent.
 * OpenAI function calling format — works with any provider.
 */

import { ls, readFile, writeFile, editFile, glob, grep } from "./backends/filesystem.js";
import { execute } from "./backends/shell.js";

/**
 * Tool definitions in OpenAI function calling schema format.
 */
export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "ls",
      description: "List directory contents. Shows files, directories, and sizes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list. Defaults to current directory.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read file contents with line numbers. Supports pagination via offset/limit.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read.",
          },
          offset: {
            type: "number",
            description: "Line offset to start reading from (0-indexed). Default: 0.",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to read. Default: 100.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file. Creates parent directories automatically.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write.",
          },
          content: {
            type: "string",
            description: "Content to write to the file.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing exact text. The old_text must match exactly (including whitespace). Use for precise, surgical edits.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit.",
          },
          old_text: {
            type: "string",
            description: "Exact text to find and replace. Must be unique in the file.",
          },
          new_text: {
            type: "string",
            description: "New text to replace old_text with.",
          },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: 'Find files matching a glob pattern (e.g., "src/**/*.js").',
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to match against.",
          },
          cwd: {
            type: "string",
            description: "Working directory for the glob. Defaults to current directory.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents with a regex pattern. Searches recursively in directories.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for.",
          },
          path: {
            type: "string",
            description: "File or directory to search. Defaults to current directory.",
          },
          case_sensitive: {
            type: "boolean",
            description: "Whether to match case-sensitively. Default: true.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute",
      description: "Run a shell command. Returns stdout/stderr. Has a 30-second default timeout.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute.",
          },
          cwd: {
            type: "string",
            description: "Working directory for the command.",
          },
          timeout_seconds: {
            type: "number",
            description: "Timeout in seconds. Default: 30.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_todos",
      description: "Create or update a task list for tracking progress on complex work. Use for tasks with 3+ steps.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "Description of the task." },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed"],
                  description: "Current status of the task.",
                },
              },
              required: ["content", "status"],
            },
            description: "Full task list (replaces existing).",
          },
        },
        required: ["todos"],
      },
    },
  },
];

/**
 * Execute a tool call and return the result.
 * @param {string} name - Tool name
 * @param {object} args - Tool arguments
 * @param {object} agentState - Shared agent state (for todos, etc.)
 * @returns {Promise<string>} Tool result text
 */
export async function executeTool(name, args, agentState = {}) {
  try {
    switch (name) {
      case "ls": {
        const result = await ls(args.path || ".");
        return result.content || result.error;
      }

      case "read_file": {
        const result = await readFile(args.path, args.offset, args.limit);
        return result.content || result.error;
      }

      case "write_file": {
        const result = await writeFile(args.path, args.content);
        return result.content || result.error;
      }

      case "edit_file": {
        const result = await editFile(args.path, args.old_text, args.new_text);
        return result.content || result.error;
      }

      case "glob": {
        const result = await glob(args.pattern, args.cwd);
        return result.content || result.error;
      }

      case "grep": {
        const result = await grep(args.pattern, args.path, {
          caseSensitive: args.case_sensitive !== false,
        });
        return result.content || result.error;
      }

      case "execute": {
        const result = await execute(args.command, {
          cwd: args.cwd,
          timeoutMs: (args.timeout_seconds || 30) * 1000,
        });
        return result.content || result.error;
      }

      case "write_todos": {
        agentState.todos = args.todos;
        const summary = args.todos.map((t) => {
          const icon = t.status === "completed" ? "✅" :
                       t.status === "in_progress" ? "🔄" : "⬜";
          return `${icon} ${t.content}`;
        }).join("\n");
        return `Task list updated:\n${summary}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error (${name}): ${err.message}`;
  }
}
