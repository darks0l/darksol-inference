import { loadConfig, saveConfig } from "../../lib/config.js";
import { createWalletSignerClient } from "../../wallet/signer-client.js";
import { openAIError } from "./errors.js";

function buildSignerConfig(config = {}) {
  return {
    enabled: Boolean(config.walletEnabled),
    baseUrl: config.walletSignerBaseUrl || "http://127.0.0.1:18790",
    token: config.walletSignerToken || null,
    tokenConfigured: Boolean(config.walletSignerToken)
  };
}

function createClientFromConfig(config, fetchImpl) {
  const signer = buildSignerConfig(config);
  if (!signer.enabled) {
    const error = new Error("Wallet control is disabled. Enable it in /v1/wallet/config first.");
    error.status = 400;
    error.code = "wallet_disabled";
    throw error;
  }

  return createWalletSignerClient({
    baseUrl: signer.baseUrl,
    token: signer.token,
    fetchImpl
  });
}

function toRpcError(error) {
  return {
    code: -32000,
    message: error?.message || "Wallet MCP error",
    data: {
      status: error?.status || 500,
      reason: error?.code || "wallet_error"
    }
  };
}

function makeRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id: id || null,
    result
  };
}

function makeRpcError(id, error) {
  return {
    jsonrpc: "2.0",
    id: id || null,
    error: toRpcError(error)
  };
}

export async function registerWalletRoutes(fastify, deps = {}) {
  const loadConfigFn = deps.loadConfigFn || loadConfig;
  const saveConfigFn = deps.saveConfigFn || saveConfig;
  const fetchImpl = deps.fetchImpl || fetch;

  fastify.get("/v1/wallet/health", async () => {
    const config = await loadConfigFn();
    const signer = buildSignerConfig(config);

    if (!signer.enabled) {
      return {
        provider: "wallet",
        enabled: false,
        configured: Boolean(signer.baseUrl),
        online: false,
        tokenConfigured: signer.tokenConfigured
      };
    }

    try {
      const client = createClientFromConfig(config, fetchImpl);
      const [address, policy] = await Promise.all([client.getAddress(), client.getPolicy()]);
      return {
        provider: "wallet",
        enabled: true,
        configured: true,
        online: true,
        tokenConfigured: signer.tokenConfigured,
        address: address?.address || null,
        policy: policy || null
      };
    } catch (error) {
      return {
        provider: "wallet",
        enabled: true,
        configured: true,
        online: false,
        tokenConfigured: signer.tokenConfigured,
        error: error.message
      };
    }
  });

  fastify.get("/v1/wallet/config", async () => {
    const config = await loadConfigFn();
    const signer = buildSignerConfig(config);
    return {
      provider: "wallet",
      enabled: signer.enabled,
      baseUrl: signer.baseUrl,
      tokenConfigured: signer.tokenConfigured
    };
  });

  fastify.post("/v1/wallet/config", async (request) => {
    const body = request.body || {};
    const current = await loadConfigFn();

    const saved = await saveConfigFn({
      walletEnabled: body.enabled ?? current.walletEnabled,
      walletSignerBaseUrl:
        typeof body.baseUrl === "string" && body.baseUrl.trim()
          ? body.baseUrl.trim()
          : current.walletSignerBaseUrl || "http://127.0.0.1:18790",
      walletSignerToken:
        typeof body.token === "string"
          ? body.token.trim() || null
          : current.walletSignerToken || null
    });

    const signer = buildSignerConfig(saved);
    return {
      ok: true,
      provider: "wallet",
      enabled: signer.enabled,
      baseUrl: signer.baseUrl,
      tokenConfigured: signer.tokenConfigured
    };
  });

  fastify.get("/v1/wallet/address", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.getAddress();
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.get("/v1/wallet/balance", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.getBalance();
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.get("/v1/wallet/policy", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.getPolicy();
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/send", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.sendTransaction(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/sign-message", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.signMessage(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/sign-typed-data", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);
      return await client.signTypedData(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  // Local MCP bridge so models can call wallet functions via existing tool-use pipeline.
  fastify.post("/wallet/mcp", async (request, reply) => {
    const body = request.body || {};
    const method = body.method;
    const id = body.id;

    if (method !== "tools/call") {
      return reply.send(makeRpcError(id, new Error("Unsupported MCP method; expected tools/call")));
    }

    const params = body.params || {};
    const toolName = params.name;
    const args = params.arguments || {};

    try {
      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);

      switch (toolName) {
        case "wallet_address":
          return reply.send(makeRpcResult(id, await client.getAddress()));
        case "wallet_balance":
          return reply.send(makeRpcResult(id, await client.getBalance()));
        case "wallet_policy":
          return reply.send(makeRpcResult(id, await client.getPolicy()));
        case "wallet_send":
          return reply.send(makeRpcResult(id, await client.sendTransaction(args)));
        case "wallet_sign_message":
          return reply.send(makeRpcResult(id, await client.signMessage(args)));
        case "wallet_sign_typed_data":
          return reply.send(makeRpcResult(id, await client.signTypedData(args)));
        default:
          return reply.send(makeRpcError(id, new Error(`Unknown wallet tool: ${toolName}`)));
      }
    } catch (error) {
      return reply.send(makeRpcError(id, error));
    }
  });
}
