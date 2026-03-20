/**
 * Planning middleware — persistent todo/task list management.
 *
 * Keeps a running task list across agent iterations.
 * Injects current tasks into system prompt context.
 * Persists to disk between sessions.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const TODO_FILE = path.join(os.homedir(), ".darksol", "agent-todos.json");

/**
 * @typedef {Object} Todo
 * @property {string} id - Unique identifier
 * @property {string} content - Task description
 * @property {'pending'|'in_progress'|'completed'} status - Current status
 * @property {number} createdAt - Unix timestamp
 * @property {number} [updatedAt] - Unix timestamp of last update
 */

/**
 * Load todos from disk.
 * @returns {Promise<Todo[]>}
 */
export async function loadTodos() {
  try {
    const raw = await fs.readFile(TODO_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Save todos to disk.
 * @param {Todo[]} todos
 */
export async function saveTodos(todos) {
  try {
    await fs.mkdir(path.dirname(TODO_FILE), { recursive: true });
    await fs.writeFile(TODO_FILE, JSON.stringify(todos, null, 2), "utf-8");
  } catch {
    // Non-fatal — in-memory todos still work
  }
}

/**
 * Clear persisted todos.
 */
export async function clearTodos() {
  try {
    await fs.writeFile(TODO_FILE, "[]", "utf-8");
  } catch { /* ignore */ }
}

/**
 * Create an in-memory todo manager for use in an agent session.
 * @param {Todo[]} [initial=[]] - Initial todo list (e.g. loaded from disk)
 * @returns {{ todos: Todo[], set: Function, format: Function, getActiveSummary: Function }}
 */
export function createTodoManager(initial = []) {
  let todos = [...initial];

  return {
    get todos() { return todos; },

    /**
     * Replace the entire todo list.
     * @param {Array<{content: string, status: string}>} items
     */
    set(items) {
      const now = Date.now();
      todos = items.map((item, i) => ({
        id: item.id || `todo_${now}_${i}`,
        content: item.content,
        status: item.status || "pending",
        createdAt: item.createdAt || now,
        updatedAt: now,
      }));
    },

    /**
     * Format todos for injection into system prompt.
     * @returns {string}
     */
    format() {
      if (todos.length === 0) return "";
      const lines = todos.map((t) => {
        const icon = t.status === "completed" ? "✅" :
                     t.status === "in_progress" ? "🔄" : "⬜";
        return `${icon} [${t.status}] ${t.content}`;
      });
      return `\n## Current Tasks\n\n${lines.join("\n")}\n`;
    },

    /**
     * Get a compact summary of active (non-completed) tasks.
     * @returns {string}
     */
    getActiveSummary() {
      const active = todos.filter((t) => t.status !== "completed");
      if (active.length === 0) return "";
      return active.map((t) => {
        const icon = t.status === "in_progress" ? "🔄" : "⬜";
        return `${icon} ${t.content}`;
      }).join("\n");
    },

    /**
     * Check if all tasks are completed.
     * @returns {boolean}
     */
    isAllDone() {
      return todos.length > 0 && todos.every((t) => t.status === "completed");
    },

    /**
     * Get completion stats.
     * @returns {{ total: number, completed: number, inProgress: number, pending: number }}
     */
    getStats() {
      return {
        total: todos.length,
        completed: todos.filter((t) => t.status === "completed").length,
        inProgress: todos.filter((t) => t.status === "in_progress").length,
        pending: todos.filter((t) => t.status === "pending").length,
      };
    },
  };
}
