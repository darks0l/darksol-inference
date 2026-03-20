/**
 * Skills middleware — progressive disclosure skill loading.
 *
 * Reads SKILL.md files from configured source directories.
 * Injects skill names + descriptions into the system prompt.
 * Agent reads full SKILL.md only when needed (lazy / on-demand).
 *
 * Compatible with the Agent Skills spec (https://agentskills.io/specification).
 * Interoperable with OpenClaw skills.
 */

import fs from "node:fs/promises";
import path from "node:path";

/** Max SKILL.md file size (10MB) */
const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024;

/** Max skill name length per spec */
const MAX_SKILL_NAME_LENGTH = 64;

/** Max skill description length per spec */
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/**
 * @typedef {Object} SkillMetadata
 * @property {string} name - Skill identifier
 * @property {string} description - What the skill does + when to use it
 * @property {string} path - Full path to the SKILL.md file
 * @property {string} [license] - License name
 * @property {string} [compatibility] - Environment requirements
 */

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * We do this without a YAML library — just basic key:value parsing.
 * @param {string} content - File content
 * @param {string} filePath - Path for error messages
 * @returns {SkillMetadata|null}
 */
export function parseSkillMetadata(content, filePath) {
  if (content.length > MAX_SKILL_FILE_SIZE) return null;

  const dirName = path.basename(path.dirname(filePath));

  // Match YAML frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const data = {};

  // Parse simple key: value pairs (handles multi-line description with |)
  let currentKey = null;
  let multilineValue = [];
  let inMultiline = false;

  for (const line of fm.split("\n")) {
    const keyMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)/);
    if (keyMatch) {
      if (inMultiline && currentKey) {
        data[currentKey] = multilineValue.join("\n").trim();
      }
      currentKey = keyMatch[1].toLowerCase().replace(/-/g, "_");
      const val = keyMatch[2].trim();
      if (val === "|" || val === ">") {
        inMultiline = true;
        multilineValue = [];
      } else {
        inMultiline = false;
        // Strip surrounding quotes
        data[currentKey] = val.replace(/^["']|["']$/g, "");
      }
    } else if (inMultiline && line.startsWith("  ")) {
      multilineValue.push(line.trim());
    }
  }
  if (inMultiline && currentKey) {
    data[currentKey] = multilineValue.join("\n").trim();
  }

  const name = (data.name || "").trim();
  const description = (data.description || "").trim();

  if (!name || !description) return null;

  // Validate name length
  if (name.length > MAX_SKILL_NAME_LENGTH) return null;

  return {
    name,
    description: description.substring(0, MAX_SKILL_DESCRIPTION_LENGTH),
    path: filePath,
    license: (data.license || "").trim() || undefined,
    compatibility: (data.compatibility || "").trim() || undefined,
  };
}

/**
 * Discover all skills in a source directory.
 * @param {string} sourcePath - Path to scan for skill subdirectories
 * @returns {Promise<SkillMetadata[]>}
 */
export async function discoverSkills(sourcePath) {
  const skills = [];

  try {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(sourcePath, entry.name);
      const skillMdPath = path.join(skillDir, "SKILL.md");

      try {
        const content = await fs.readFile(skillMdPath, "utf-8");
        const metadata = parseSkillMetadata(content, skillMdPath);
        if (metadata) {
          skills.push(metadata);
        }
      } catch {
        // No SKILL.md in this directory — skip
      }
    }
  } catch {
    // Source directory doesn't exist — OK
  }

  return skills;
}

/**
 * Format skills list for injection into system prompt.
 * @param {SkillMetadata[]} skills
 * @param {string[]} sources - Source paths (for "no skills" message)
 * @returns {string}
 */
export function formatSkillsList(skills, sources = []) {
  if (skills.length === 0) {
    const paths = sources.map((s) => `\`${s}\``).join(", ");
    return `(No skills found in ${paths || "configured sources"})`;
  }

  const lines = [];
  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
    if (skill.compatibility) {
      lines.push(`  → Requires: ${skill.compatibility}`);
    }
    lines.push(`  → Read \`${skill.path}\` for full instructions`);
  }
  return lines.join("\n");
}

/**
 * Build the skills section for the system prompt.
 * @param {SkillMetadata[]} skills
 * @param {string[]} sources
 * @returns {string}
 */
export function buildSkillsPrompt(skills, sources) {
  const list = formatSkillsList(skills, sources);
  return `
## Skills Library

You have access to a skills library with specialized capabilities.

**How to use skills (progressive disclosure):**
1. Check if the user's task matches a skill's description below
2. If yes, read the full SKILL.md with \`read_file\` before proceeding
3. Follow the skill's step-by-step instructions
4. Access any helper files the skill references using their absolute paths

**Available Skills:**

${list}
`.trim();
}

/**
 * Create a skills manager for an agent session.
 *
 * @param {object} options
 * @param {string[]} [options.sources] - Paths to scan for skills
 * @returns {{ load: Function, getPromptSection: Function, find: Function }}
 */
export function createSkillsManager(options = {}) {
  const {
    sources = [
      path.join(process.env.HOME || process.env.USERPROFILE || "~", ".darksol", "skills"),
      path.join(process.cwd(), "skills"),
    ],
  } = options;

  let loadedSkills = [];
  let loaded = false;

  return {
    /**
     * Load skills from all configured sources.
     * Later sources override earlier ones for same-named skills.
     * @returns {Promise<SkillMetadata[]>}
     */
    async load() {
      if (loaded) return loadedSkills;

      const skillMap = new Map();

      for (const source of sources) {
        const skills = await discoverSkills(source);
        for (const skill of skills) {
          skillMap.set(skill.name, skill); // Last one wins
        }
      }

      loadedSkills = Array.from(skillMap.values());
      loaded = true;
      return loadedSkills;
    },

    /**
     * Get the skills section for the system prompt.
     * Loads skills if not already loaded.
     * @returns {Promise<string>}
     */
    async getPromptSection() {
      await this.load();
      if (loadedSkills.length === 0) return "";
      return "\n" + buildSkillsPrompt(loadedSkills, sources);
    },

    /**
     * Find a skill by name.
     * @param {string} name
     * @returns {SkillMetadata|undefined}
     */
    find(name) {
      return loadedSkills.find((s) => s.name === name);
    },

    /** Get all loaded skills */
    getAll() { return loadedSkills; },

    /** Force reload */
    reset() {
      loaded = false;
      loadedSkills = [];
    },
  };
}
