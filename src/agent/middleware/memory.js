/**
 * Memory middleware — AGENTS.md persistent context loading.
 *
 * Loads memory/context files (AGENTS.md) from configured paths.
 * Injects content into system prompt as persistent context.
 * Agent can update memory via edit_file tool.
 *
 * Compatible with the AGENTS.md spec (https://agents.md/).
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/** Default memory file paths */
const DEFAULT_SOURCES = [
  path.join(os.homedir(), ".darksol", "AGENTS.md"),
  path.join(process.cwd(), "AGENTS.md"),
];

const MEMORY_PROMPT_TEMPLATE = `## Persistent Memory

The following context was loaded from your memory files. This is information you've learned and saved across sessions.
Update these files via \`edit_file\` when you learn something important.

**Memory sources:** {sources}

---

{contents}

---

**When to update memory:**
- When the user tells you to remember something
- When you learn user preferences or patterns
- When you discover important context for future sessions

**When NOT to update:**
- Transient info ("I'm busy today")
- One-time tasks
- Simple questions without lasting implications
- NEVER store API keys, passwords, or secrets`;

/**
 * Load a memory file from disk.
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function loadMemoryFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Create a memory manager for an agent session.
 *
 * @param {object} options
 * @param {string[]} [options.sources] - Paths to AGENTS.md files
 * @returns {{ load: Function, getPromptSection: Function, getSourcePaths: Function }}
 */
export function createMemoryManager(options = {}) {
  const { sources = DEFAULT_SOURCES } = options;

  let loadedContents = {};
  let loaded = false;

  return {
    /**
     * Load memory from all configured sources.
     * @returns {Promise<Record<string, string>>} Map of path -> content
     */
    async load() {
      if (loaded) return loadedContents;

      for (const source of sources) {
        const content = await loadMemoryFile(source);
        if (content) {
          loadedContents[source] = content;
        }
      }

      loaded = true;
      return loadedContents;
    },

    /**
     * Get the memory section for the system prompt.
     * @returns {Promise<string>}
     */
    async getPromptSection() {
      await this.load();

      const entries = Object.entries(loadedContents);
      if (entries.length === 0) return "";

      const sourceList = sources.join(", ");
      const contentSections = entries.map(([filePath, content]) => {
        const name = path.basename(filePath);
        return `**From ${name} (${filePath}):**\n\n${content}`;
      }).join("\n\n---\n\n");

      return "\n" + MEMORY_PROMPT_TEMPLATE
        .replace("{sources}", sourceList)
        .replace("{contents}", contentSections);
    },

    /**
     * Get configured source paths.
     * @returns {string[]}
     */
    getSourcePaths() {
      return sources;
    },

    /**
     * Check if any memory was loaded.
     * @returns {boolean}
     */
    hasMemory() {
      return Object.keys(loadedContents).length > 0;
    },

    /** Force reload on next access */
    reset() {
      loaded = false;
      loadedContents = {};
    },
  };
}

/**
 * Ensure a memory file exists (creates with default content if not).
 * @param {string} filePath
 * @param {string} [defaultContent]
 * @returns {Promise<void>}
 */
export async function ensureMemoryFile(filePath, defaultContent = "# Agent Memory\n\n") {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContent, "utf-8");
  }
}
