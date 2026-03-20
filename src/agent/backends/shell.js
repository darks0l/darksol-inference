/**
 * Shell Backend — Command execution for the deep agent.
 * Runs shell commands with timeout, safety, and output capture.
 */

import { spawn } from "node:child_process";
import path from "node:path";

/** Default timeout for commands (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Max output characters before truncation */
const MAX_OUTPUT_CHARS = 50_000;

/** Commands that are always blocked */
const BLOCKED_COMMANDS = new Set([
  "rm -rf /", "rm -rf /*", "mkfs", "dd if=",
  ":(){ :|:& };:", "fork", "shutdown", "reboot", "halt",
]);

/**
 * Execute a shell command.
 * @param {string} command - Command to run
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {number} [options.timeoutMs=30000] - Timeout in milliseconds
 * @param {Object<string,string>} [options.env] - Additional env vars
 * @returns {Promise<{content?: string, error?: string}>}
 */
export async function execute(command, options = {}) {
  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    env = {},
  } = options;

  // Safety check
  const lower = command.toLowerCase().trim();
  for (const blocked of BLOCKED_COMMANDS) {
    if (lower.includes(blocked)) {
      return { error: `Blocked dangerous command: ${command}` };
    }
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    let stdout = "";
    let stderr = "";
    let killed = false;

    const proc = spawn(shell, shellArgs, {
      cwd: path.resolve(cwd),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, 2000);
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_CHARS) {
        stdout += chunk.toString();
      }
    });

    proc.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_CHARS) {
        stderr += chunk.toString();
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ error: `Failed to execute: ${err.message}` });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (killed) {
        resolve({ error: `Command timed out after ${timeoutMs / 1000}s. Partial output:\n${truncate(stdout + stderr)}` });
        return;
      }

      // Truncate output if needed
      stdout = truncate(stdout);
      stderr = truncate(stderr);

      let content = "";
      if (stdout) content += stdout;
      if (stderr) content += (content ? "\n\n--- stderr ---\n" : "") + stderr;
      if (!content) content = "(no output)";

      if (code !== 0) {
        content = `⚠️ Exit code ${code}\n\n${content}`;
      }

      resolve({ content });
    });
  });
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.substring(0, MAX_OUTPUT_CHARS) + `\n\n[Output truncated at ${MAX_OUTPUT_CHARS} chars]`;
}
