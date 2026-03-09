import { createBankrClientFromConfig, createBankrClientFromEnv } from "../../bankr/client.js";
import { loadConfig, saveConfig } from "../../lib/config.js";
import { openAIError } from "./errors.js";

export async function registerBankrRoutes(fastify, deps = {}) {
  const loadConfigFn = deps.loadConfigFn || loadConfig;
  const saveConfigFn = deps.saveConfigFn || saveConfig;

  fastify.get("/v1/bankr/health", async () => {
    const config = await loadConfigFn();
    const status = {
      provider: "bankr",
      configured: Boolean(config.bankrEnabled && config.bankrApiKey),
      enabled: Boolean(config.bankrEnabled),
      sandbox: Boolean(config.bankrSandbox),
      baseUrlConfigured: Boolean(config.bankrBaseUrl),
      apiKeyConfigured: Boolean(config.bankrApiKey)
    };

    // Backwards compatibility with env-based tests/setup.
    if (!status.apiKeyConfigured && process.env.BANKR_API_KEY) {
      return createBankrClientFromEnv().getHealthStatus();
    }

    return status;
  });

  fastify.get("/v1/bankr/models", async (request, reply) => {
    try {
      const client = await createBankrClientFromConfig();
      const models = await client.listModels();
      return {
        object: "list",
        provider: "bankr",
        data: (models.data || []).map((item) => ({
          ...item,
          id: `bankr/${item.id}`,
          provider: "bankr"
        }))
      };
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "bankr_error");
    }
  });

  fastify.get("/v1/bankr/usage", async (request, reply) => {
    try {
      const client = await createBankrClientFromConfig();
      const usage = await client.usageSummary(request.query?.days || 30);
      return usage;
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "bankr_error");
    }
  });

  fastify.get("/v1/bankr/config", async () => {
    const config = await loadConfigFn();
    return {
      provider: "bankr",
      enabled: Boolean(config.bankrEnabled),
      baseUrl: config.bankrBaseUrl || "https://llm.bankr.bot",
      apiKeyConfigured: Boolean(config.bankrApiKey),
      sandbox: Boolean(config.bankrSandbox),
      defaultRoute: config.bankrDefaultRoute || "local"
    };
  });

  fastify.post("/v1/bankr/config", async (request) => {
    const body = request.body || {};
    const current = await loadConfigFn();

    const saved = await saveConfigFn({
      bankrEnabled: body.enabled ?? current.bankrEnabled,
      bankrBaseUrl: typeof body.baseUrl === "string" && body.baseUrl.trim()
        ? body.baseUrl.trim()
        : (current.bankrBaseUrl || "https://llm.bankr.bot"),
      bankrApiKey: typeof body.apiKey === "string"
        ? body.apiKey.trim() || null
        : current.bankrApiKey,
      bankrSandbox: body.sandbox ?? current.bankrSandbox,
      bankrDefaultRoute: body.defaultRoute === "bankr" ? "bankr" : "local"
    });

    return {
      ok: true,
      provider: "bankr",
      enabled: Boolean(saved.bankrEnabled),
      baseUrl: saved.bankrBaseUrl,
      apiKeyConfigured: Boolean(saved.bankrApiKey),
      sandbox: Boolean(saved.bankrSandbox),
      defaultRoute: saved.bankrDefaultRoute || "local"
    };
  });
}
