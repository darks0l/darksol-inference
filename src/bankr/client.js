import { loadConfig } from "../lib/config.js";

function asBool(value) {
  return value === "1" || value === "true";
}

export class BankrError extends Error {
  constructor(message, { status = 500, code = "bankr_error", cause } = {}) {
    super(message);
    this.name = "BankrError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

function normalizeBaseUrl(input) {
  return String(input || "https://llm.bankr.bot").replace(/\/+$/, "");
}

function authHeaders(apiKey) {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    authorization: `Bearer ${apiKey}`
  };
}

async function parseJsonOrThrow(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Bankr request failed (${response.status})`;
    const code = payload?.error?.type || "bankr_upstream_error";
    throw new BankrError(message, { status: response.status, code });
  }
  return payload;
}

export function createBankrClient({
  baseUrl = "https://llm.bankr.bot",
  apiKey = null,
  enabled = false,
  sandbox = true,
  fetchImpl = fetch
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const configured = Boolean(enabled && normalizedBaseUrl && apiKey);

  return {
    isConfigured() {
      return configured;
    },

    getHealthStatus() {
      return {
        provider: "bankr",
        configured,
        enabled: Boolean(enabled),
        sandbox,
        baseUrlConfigured: Boolean(normalizedBaseUrl),
        apiKeyConfigured: Boolean(apiKey)
      };
    },

    async listModels() {
      if (!configured) {
        return { object: "list", data: [] };
      }
      const response = await fetchImpl(`${normalizedBaseUrl}/v1/models`, {
        method: "GET",
        headers: authHeaders(apiKey)
      });
      return await parseJsonOrThrow(response);
    },

    async usageSummary(days = 30) {
      if (!configured) {
        return {
          object: "usage_summary",
          days,
          totals: {
            totalRequests: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            totalCost: 0
          },
          byModel: []
        };
      }

      const safeDays = Math.min(90, Math.max(1, Number(days) || 30));
      const response = await fetchImpl(`${normalizedBaseUrl}/v1/usage?days=${safeDays}`, {
        method: "GET",
        headers: authHeaders(apiKey)
      });
      return await parseJsonOrThrow(response);
    },

    async chatCompletions(payload, { signal } = {}) {
      if (!configured) {
        throw new BankrError("Bankr is not configured.", { status: 400, code: "bankr_not_configured" });
      }

      const response = await fetchImpl(`${normalizedBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal
      });

      return response;
    }
  };
}

export async function createBankrClientFromConfig({ fetchImpl } = {}) {
  const config = await loadConfig();
  return createBankrClient({
    baseUrl: config.bankrBaseUrl,
    apiKey: config.bankrApiKey,
    enabled: config.bankrEnabled,
    sandbox: config.bankrSandbox,
    fetchImpl
  });
}

export function createBankrClientFromEnv(env = process.env) {
  const baseUrl = env.BANKR_BASE_URL || "https://llm.bankr.bot";
  const apiKey = env.BANKR_API_KEY || null;
  const sandbox = env.BANKR_SANDBOX ? asBool(env.BANKR_SANDBOX) : true;
  const enabled = env.BANKR_ENABLED === undefined ? Boolean(apiKey) : asBool(env.BANKR_ENABLED);
  return createBankrClient({ baseUrl, apiKey, enabled, sandbox });
}
