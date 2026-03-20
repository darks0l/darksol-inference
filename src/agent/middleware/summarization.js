/**
 * Summarization middleware — auto-compresses conversation history.
 *
 * When a conversation approaches the model's context limit, this middleware:
 *   1. Detects the threshold (fraction-based: 85% of context window)
 *   2. Offloads old messages to a history file on disk
 *   3. Generates a summary via the LLM
 *   4. Replaces old messages with the summary
 *   5. Keeps the most recent messages intact (10% retention)
 *
 * Port of deepagents' createSummarizationMiddleware to vanilla Node.js.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/** Approximate characters per token */
const CHARS_PER_TOKEN = 4;

/** Default context window if model doesn't advertise one */
const DEFAULT_CONTEXT_TOKENS = 128_000;

/** Fraction of context window that triggers summarization */
const TRIGGER_FRACTION = 0.85;

/** Fraction of context window to keep after summarization */
const KEEP_FRACTION = 0.10;

/** Max tokens to send to the summarizer model */
const MAX_SUMMARIZE_TOKENS = 4_000;

/** Directory for history files */
const HISTORY_DIR = path.join(os.homedir(), ".darksol", "conversation_history");

const DEFAULT_SUMMARY_PROMPT = `You are a conversation summarizer. Create a concise summary that captures:
1. The main task or objective
2. Key decisions and conclusions reached
3. Files created, edited, or commands run
4. Important context needed to continue

Keep it focused. Omit pleasantries.

Conversation:
{conversation}

Summary:`;

/**
 * Estimate tokens for a list of messages.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateTokens(messages) {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") chars += msg.content.length;
    if (msg.tool_calls) chars += JSON.stringify(msg.tool_calls).length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Find a safe cutoff point that doesn't split AI/Tool message pairs.
 * If a cutoff falls in the middle of a tool-call/result group, adjust it.
 * @param {Array<object>} messages
 * @param {number} rawCutoff
 * @returns {number}
 */
function findSafeCutoff(messages, rawCutoff) {
  if (rawCutoff >= messages.length) return rawCutoff;

  // If the cutoff falls on a tool message, walk forward past all tool messages
  let i = rawCutoff;
  while (i < messages.length && messages[i].role === "tool") {
    i++;
  }

  // If we moved forward, check if we went too far (past everything useful)
  if (i !== rawCutoff && i >= messages.length - 2) {
    // Walked off the end — walk backward instead to before the assistant call
    let j = rawCutoff - 1;
    while (j >= 0 && messages[j].role === "tool") j--;
    if (j >= 0 && messages[j].role === "assistant" && messages[j].tool_calls) {
      return j; // Cut before the assistant+tool group
    }
  }

  return i;
}

/**
 * Format messages for summarization.
 * @param {Array<object>} messages
 * @returns {string}
 */
function formatForSummary(messages) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return `[Tool result: ${(m.content || "").substring(0, 300)}]`;
    }
    if (m.role === "assistant" && m.tool_calls) {
      const calls = m.tool_calls.map((tc) => `${tc.function?.name}()`).join(", ");
      const text = m.content ? `\n${m.content}` : "";
      return `Assistant: [Called: ${calls}]${text}`;
    }
    return `${m.role === "user" ? "User" : "Assistant"}: ${(m.content || "").substring(0, 500)}`;
  }).join("\n");
}

/**
 * Offload messages to a history file.
 * @param {Array<object>} messages - Messages to archive
 * @param {string} sessionId - Session identifier
 * @returns {Promise<string|null>} Path to history file, or null on failure
 */
async function offloadToHistory(messages, sessionId) {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    const filePath = path.join(HISTORY_DIR, `${sessionId}.md`);
    const timestamp = new Date().toISOString();
    const section = `## Summarized at ${timestamp}\n\n${formatForSummary(messages)}\n\n---\n\n`;

    // Append (file may already exist from prior summarizations)
    await fs.appendFile(filePath, section, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Generate a summary of messages using the LLM.
 * @param {Array<object>} messages - Messages to summarize
 * @param {Function} llmCall - Function that calls the LLM: (messages) => Promise<string>
 * @returns {Promise<string>}
 */
async function generateSummary(messages, llmCall) {
  // Trim to max tokens for the summarizer
  let trimmed = messages;
  const totalTokens = estimateTokens(messages);
  if (totalTokens > MAX_SUMMARIZE_TOKENS) {
    // Keep only the most recent messages that fit
    let kept = 0;
    const result = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const t = estimateTokens([messages[i]]);
      if (kept + t > MAX_SUMMARIZE_TOKENS) break;
      result.unshift(messages[i]);
      kept += t;
    }
    trimmed = result;
  }

  const conversation = formatForSummary(trimmed);
  const prompt = DEFAULT_SUMMARY_PROMPT.replace("{conversation}", conversation);

  try {
    return await llmCall([{ role: "user", content: prompt }]);
  } catch {
    // Fallback: basic summary without LLM
    const topics = trimmed
      .filter((m) => m.role === "user")
      .map((m) => (m.content || "").substring(0, 100))
      .join("; ");
    return `Earlier conversation covered: ${topics}`;
  }
}

/**
 * Build a summary system message.
 * @param {string} summary
 * @param {string|null} historyPath
 * @returns {object} Message object
 */
function buildSummaryMessage(summary, historyPath) {
  let content;
  if (historyPath) {
    content = `[Earlier conversation has been summarized. Full history at: ${historyPath}]

Summary of what happened:
${summary}`;
  } else {
    content = `[Earlier conversation summary]\n${summary}`;
  }
  return { role: "user", content, _isSummary: true };
}

/**
 * Create a summarization manager for use in an agent session.
 *
 * @param {object} options
 * @param {number} [options.contextWindowTokens] - Model context size
 * @param {Function} [options.llmCall] - Async function: (messages) => response text
 * @param {string} [options.sessionId] - Session ID for history files
 * @returns {{ shouldSummarize: Function, summarize: Function, getEffectiveMessages: Function }}
 */
export function createSummarizationManager(options = {}) {
  const {
    contextWindowTokens = DEFAULT_CONTEXT_TOKENS,
    llmCall,
    sessionId = `session_${crypto.randomBytes(4).toString("hex")}`,
  } = options;

  const triggerTokens = Math.floor(contextWindowTokens * TRIGGER_FRACTION);
  const keepTokens = Math.floor(contextWindowTokens * KEEP_FRACTION);

  // Track the last summarization event
  let lastSummaryMessage = null;
  let lastCutoffIndex = 0;

  return {
    /**
     * Check if summarization should trigger.
     * @param {Array<object>} messages
     * @returns {boolean}
     */
    shouldSummarize(messages) {
      const tokens = estimateTokens(messages);
      return tokens >= triggerTokens;
    },

    /**
     * Perform summarization: archive old messages, generate summary, return trimmed history.
     * @param {Array<object>} messages - Full conversation history
     * @returns {Promise<Array<object>>} New message list with summary replacing old messages
     */
    async summarize(messages) {
      const totalTokens = estimateTokens(messages);
      if (totalTokens < triggerTokens) return messages;

      // Determine cutoff: keep the last N tokens
      let keptTokens = 0;
      let rawCutoff = 0;
      for (let i = messages.length - 1; i >= 0; i--) {
        const t = estimateTokens([messages[i]]);
        if (keptTokens + t > keepTokens) {
          rawCutoff = i + 1;
          break;
        }
        keptTokens += t;
      }

      const cutoff = findSafeCutoff(messages, rawCutoff);
      if (cutoff <= 0) return messages; // Nothing to cut

      const toSummarize = messages.slice(0, cutoff);
      const toKeep = messages.slice(cutoff);

      // Archive and summarize
      const historyPath = await offloadToHistory(toSummarize, sessionId);
      const summaryText = llmCall
        ? await generateSummary(toSummarize, llmCall)
        : `Summarized ${toSummarize.length} messages.`;

      const summaryMsg = buildSummaryMessage(summaryText, historyPath);
      lastSummaryMessage = summaryMsg;
      lastCutoffIndex = cutoff;

      return [summaryMsg, ...toKeep];
    },

    /**
     * Get the effective message list (applies last summarization event if any).
     * @param {Array<object>} messages - Raw message history
     * @returns {Array<object>}
     */
    getEffectiveMessages(messages) {
      if (!lastSummaryMessage) return messages;
      return [lastSummaryMessage, ...messages.slice(lastCutoffIndex)];
    },

    /** Get session ID for history files */
    getSessionId() { return sessionId; },

    /** Get history file path */
    getHistoryPath() {
      return path.join(HISTORY_DIR, `${sessionId}.md`);
    },

    /** Reset summarization state */
    reset() {
      lastSummaryMessage = null;
      lastCutoffIndex = 0;
    },
  };
}

/**
 * Read the full conversation history for a session.
 * @param {string} sessionId
 * @returns {Promise<string|null>}
 */
export async function readConversationHistory(sessionId) {
  try {
    const filePath = path.join(HISTORY_DIR, `${sessionId}.md`);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
