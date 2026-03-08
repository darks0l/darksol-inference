import fs from "node:fs/promises";
import path from "node:path";
import { ensureDarksolDirs, usagePath } from "./paths.js";

const EMPTY_USAGE = {
  total_runs: 0,
  total_tokens_in: 0,
  total_tokens_out: 0,
  total_tokens: 0,
  total_cost: 0
};

function normalizeUsage(value) {
  return {
    total_runs: Number(value?.total_runs) || 0,
    total_tokens_in: Number(value?.total_tokens_in) || 0,
    total_tokens_out: Number(value?.total_tokens_out) || 0,
    total_tokens: Number(value?.total_tokens) || 0,
    total_cost: Number(value?.total_cost) || 0
  };
}

async function ensureUsageDirectory(fsApi, usageFilePath) {
  if (usageFilePath === usagePath) {
    await ensureDarksolDirs();
    return;
  }

  await fsApi.mkdir(path.dirname(usageFilePath), { recursive: true });
}

export function estimateTokens(text) {
  const normalized = typeof text === "string" ? text : String(text ?? "");
  const trimmed = normalized.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateMessageTokens(messages = []) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((sum, message) => sum + estimateTokens(message?.content || ""), 0);
}

export async function readUsageStats({ fsApi = fs, usageFilePath = usagePath } = {}) {
  await ensureUsageDirectory(fsApi, usageFilePath);

  try {
    const raw = await fsApi.readFile(usageFilePath, "utf8");
    return normalizeUsage(JSON.parse(raw));
  } catch {
    await writeUsageStats(EMPTY_USAGE, { fsApi, usageFilePath });
    return { ...EMPTY_USAGE };
  }
}

export async function writeUsageStats(stats, { fsApi = fs, usageFilePath = usagePath } = {}) {
  await ensureUsageDirectory(fsApi, usageFilePath);
  await fsApi.writeFile(usageFilePath, `${JSON.stringify(normalizeUsage(stats), null, 2)}\n`, "utf8");
}

export async function recordInferenceUsage(
  {
    tokensIn = 0,
    tokensOut = 0,
    provider = "local"
  } = {},
  deps = {}
) {
  const fsApi = deps.fsApi || fs;
  const usageFilePath = deps.usageFilePath || usagePath;
  const stats = await readUsageStats({ fsApi, usageFilePath });

  const next = {
    ...stats,
    total_runs: stats.total_runs + 1,
    total_tokens_in: stats.total_tokens_in + Math.max(0, Number(tokensIn) || 0),
    total_tokens_out: stats.total_tokens_out + Math.max(0, Number(tokensOut) || 0)
  };
  next.total_tokens = next.total_tokens_in + next.total_tokens_out;

  const normalizedProvider = String(provider || "local").toLowerCase();
  if (normalizedProvider === "local" || normalizedProvider === "ollama") {
    next.total_cost = Number(stats.total_cost || 0);
  } else {
    next.total_cost = Number(stats.total_cost || 0);
  }

  await writeUsageStats(next, { fsApi, usageFilePath });
  return next;
}
