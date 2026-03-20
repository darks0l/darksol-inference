/**
 * Filesystem Backend — Real filesystem operations for the deep agent.
 * Provides ls, read, write, edit, glob, grep with safety and pagination.
 *
 * Inspired by deepagents FilesystemBackend but zero-dependency vanilla Node.js.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Default pagination for read_file */
const DEFAULT_LINE_LIMIT = 100;
const DEFAULT_LINE_OFFSET = 0;

/** Max characters per line before truncation in grep results */
const MAX_GREP_LINE_LENGTH = 500;

/** Max results for ls/glob/grep before truncation */
const MAX_LS_RESULTS = 200;
const MAX_GLOB_RESULTS = 200;
const MAX_GREP_RESULTS = 50;

/**
 * List directory contents.
 * @param {string} dirPath - Directory to list
 * @returns {Promise<{files?: Array<{name: string, type: string, size: number}>, error?: string}>}
 */
export async function ls(dirPath) {
  try {
    const resolved = path.resolve(dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    const files = [];
    for (const entry of entries.slice(0, MAX_LS_RESULTS)) {
      const fullPath = path.join(resolved, entry.name);
      let size = 0;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch {
        // Permission denied or broken symlink
      }
      files.push({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size,
      });
    }

    const truncated = entries.length > MAX_LS_RESULTS;
    let result = `Listed ${files.length} entries in ${resolved}`;
    if (truncated) result += ` (truncated from ${entries.length} — refine your search)`;
    result += "\n\n";

    for (const f of files) {
      const sizeStr = f.type === "directory" ? "<dir>" : formatSize(f.size);
      result += `${f.type === "directory" ? "📁" : "📄"} ${f.name}  ${sizeStr}\n`;
    }

    return { content: result.trim() };
  } catch (err) {
    return { error: `ls failed: ${err.message}` };
  }
}

/**
 * Read file contents with optional line-based pagination.
 * @param {string} filePath - File to read
 * @param {number} [offset=0] - Line offset (0-indexed)
 * @param {number} [limit=100] - Max lines to read
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function readFile(filePath, offset = DEFAULT_LINE_OFFSET, limit = DEFAULT_LINE_LIMIT) {
  try {
    const resolved = path.resolve(filePath);
    const stat = await fs.stat(resolved);

    if (stat.isDirectory()) {
      return { error: `${filePath} is a directory. Use ls() instead.` };
    }

    // Check if binary
    if (isBinaryPath(resolved)) {
      return { error: `${filePath} appears to be a binary file. Cannot display inline.` };
    }

    const lines = [];
    let lineNum = 0;
    let totalLines = 0;

    const rl = createInterface({
      input: createReadStream(resolved, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      totalLines++;
      if (lineNum >= offset && lineNum < offset + limit) {
        lines.push(`${String(lineNum + 1).padStart(5)} │ ${line}`);
      }
      lineNum++;
      if (lineNum >= offset + limit + 1000) {
        // Don't read entire huge files just to count
        break;
      }
    }

    let content = lines.join("\n");

    const remaining = totalLines - (offset + limit);
    if (remaining > 0) {
      content += `\n\n[${remaining}+ more lines. Use offset=${offset + limit} to continue]`;
    }
    if (offset > 0) {
      content = `[Showing lines ${offset + 1}-${Math.min(offset + limit, totalLines)} of ${totalLines}+]\n\n${content}`;
    }

    return { content };
  } catch (err) {
    if (err.code === "ENOENT") return { error: `File not found: ${filePath}` };
    return { error: `read failed: ${err.message}` };
  }
}

/**
 * Write content to a file. Creates parent directories if needed.
 * @param {string} filePath - File to write
 * @param {string} content - Content to write
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function writeFile(filePath, content) {
  try {
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    const lines = content.split("\n").length;
    const bytes = Buffer.byteLength(content, "utf-8");
    return { content: `✅ Wrote ${lines} lines (${formatSize(bytes)}) to ${filePath}` };
  } catch (err) {
    return { error: `write failed: ${err.message}` };
  }
}

/**
 * Edit a file by replacing exact text.
 * @param {string} filePath - File to edit
 * @param {string} oldText - Text to find (exact match)
 * @param {string} newText - Replacement text
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function editFile(filePath, oldText, newText) {
  try {
    const resolved = path.resolve(filePath);
    const existing = await fs.readFile(resolved, "utf-8");

    if (!existing.includes(oldText)) {
      // Try to help with whitespace issues
      const trimmedOld = oldText.trim();
      if (existing.includes(trimmedOld)) {
        return { error: `Exact match not found, but trimmed version exists. The oldText has leading/trailing whitespace differences. Try again with the exact text.` };
      }
      return { error: `oldText not found in ${filePath}. No changes made.` };
    }

    const count = existing.split(oldText).length - 1;
    if (count > 1) {
      return { error: `oldText found ${count} times in ${filePath}. Must be unique. No changes made.` };
    }

    const updated = existing.replace(oldText, newText);
    await fs.writeFile(resolved, updated, "utf-8");

    const oldLines = oldText.split("\n").length;
    const newLines = newText.split("\n").length;
    return { content: `✅ Edited ${filePath}: replaced ${oldLines} lines with ${newLines} lines` };
  } catch (err) {
    if (err.code === "ENOENT") return { error: `File not found: ${filePath}` };
    return { error: `edit failed: ${err.message}` };
  }
}

/**
 * Glob for files matching a pattern.
 * @param {string} pattern - Glob pattern (e.g., "src/**\/*.js")
 * @param {string} [cwd] - Working directory
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function glob(pattern, cwd = ".") {
  try {
    const resolved = path.resolve(cwd);

    // Use fs.glob if available (Node 22+), otherwise basic recursive walk
    let matches;
    if (fs.glob) {
      matches = [];
      for await (const entry of fs.glob(pattern, { cwd: resolved })) {
        matches.push(entry);
        if (matches.length >= MAX_GLOB_RESULTS) break;
      }
    } else {
      // Fallback: simple recursive walk with basic pattern matching
      matches = await simpleGlob(resolved, pattern);
    }

    if (matches.length === 0) {
      return { content: `No files matched pattern: ${pattern}` };
    }

    let result = `Found ${matches.length} matches for "${pattern}":\n\n`;
    result += matches.map((m) => `  ${m}`).join("\n");
    if (matches.length >= MAX_GLOB_RESULTS) {
      result += `\n\n[Truncated at ${MAX_GLOB_RESULTS} results — refine your pattern]`;
    }

    return { content: result };
  } catch (err) {
    return { error: `glob failed: ${err.message}` };
  }
}

/**
 * Search file contents for a pattern.
 * @param {string} pattern - Regex pattern to search for
 * @param {string} [searchPath] - Path to search (file or directory)
 * @param {object} [options]
 * @param {boolean} [options.caseSensitive=true]
 * @param {number} [options.maxResults=50]
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function grep(pattern, searchPath = ".", options = {}) {
  const { caseSensitive = true, maxResults = MAX_GREP_RESULTS } = options;

  try {
    const resolved = path.resolve(searchPath);
    const stat = await fs.stat(resolved);
    const flags = caseSensitive ? "g" : "gi";
    let regex;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return { error: `Invalid regex pattern: ${pattern}` };
    }

    const results = [];

    if (stat.isFile()) {
      await grepFile(resolved, regex, results, maxResults);
    } else {
      await grepDirectory(resolved, regex, results, maxResults);
    }

    if (results.length === 0) {
      return { content: `No matches for /${pattern}/ in ${searchPath}` };
    }

    let output = `Found ${results.length} matches for /${pattern}/:\n\n`;
    for (const r of results) {
      const lineText = r.line.length > MAX_GREP_LINE_LENGTH
        ? r.line.substring(0, MAX_GREP_LINE_LENGTH) + "..."
        : r.line;
      output += `${r.file}:${r.lineNum}: ${lineText}\n`;
    }
    if (results.length >= maxResults) {
      output += `\n[Truncated at ${maxResults} results — refine your search]`;
    }

    return { content: output.trim() };
  } catch (err) {
    return { error: `grep failed: ${err.message}` };
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function grepFile(filePath, regex, results, maxResults) {
  if (isBinaryPath(filePath)) return;
  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    let lineNum = 0;
    for await (const line of rl) {
      lineNum++;
      if (results.length >= maxResults) break;
      if (regex.test(line)) {
        results.push({ file: filePath, lineNum, line: line.trimEnd() });
        regex.lastIndex = 0; // Reset for global regex
      }
    }
  } catch {
    // Skip files we can't read
  }
}

async function grepDirectory(dirPath, regex, results, maxResults, depth = 0) {
  if (depth > 10 || results.length >= maxResults) return;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await grepDirectory(full, regex, results, maxResults, depth + 1);
      } else if (entry.isFile()) {
        await grepFile(full, regex, results, maxResults);
      }
    }
  } catch {
    // Skip dirs we can't read
  }
}

async function simpleGlob(rootDir, pattern) {
  // Basic glob: supports * and ** only
  const results = [];
  const parts = pattern.split("/");

  async function walk(dir, partIndex) {
    if (results.length >= MAX_GLOB_RESULTS) return;
    if (partIndex >= parts.length) return;

    const part = parts[partIndex];
    const isLast = partIndex === parts.length - 1;

    if (part === "**") {
      // Recursive: match everything at this level and recurse
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, partIndex); // Stay on **
          await walk(full, partIndex + 1); // Move past **
        } else if (isLast || partIndex + 1 === parts.length - 1) {
          const nextPart = parts[partIndex + 1];
          if (!nextPart || matchWildcard(entry.name, nextPart)) {
            results.push(path.relative(path.resolve("."), full));
          }
        }
      }
    } else {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!matchWildcard(entry.name, part)) continue;
        const full = path.join(dir, entry.name);
        if (isLast) {
          results.push(path.relative(path.resolve("."), full));
        } else if (entry.isDirectory()) {
          await walk(full, partIndex + 1);
        }
      }
    }
  }

  await walk(rootDir, 0);
  return results;
}

function matchWildcard(name, pattern) {
  if (pattern === "*") return true;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function isBinaryPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
    ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".avi", ".mov", ".mkv",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".sqlite", ".db", ".pyc", ".class", ".wasm",
  ]);
  return binaryExts.has(ext);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
