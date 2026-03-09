import crypto from "node:crypto";
import { loadConfig, saveConfig } from "../../lib/config.js";
import { createWalletSignerClient } from "../../wallet/signer-client.js";
import { openAIError } from "./errors.js";

// Pending confirmation store (in-memory, TTL-based)
const pendingConfirmations = new Map();
const CONFIRMATION_TTL_MS = 120_000; // 2 minutes

function createPendingConfirmation(action, payload) {
  const id = crypto.randomUUID();
  const entry = {
    id,
    action,
    payload,
    createdAt: Date.now(),
    expiresAt: Date.now() + CONFIRMATION_TTL_MS
  };
  pendingConfirmations.set(id, entry);
  return entry;
}

function consumePendingConfirmation(id) {
  const entry = pendingConfirmations.get(id);
  if (!entry) return null;
  pendingConfirmations.delete(id);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

// Periodic cleanup of expired entries (unref so it doesn't block process exit)
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingConfirmations) {
    if (now > entry.expiresAt) pendingConfirmations.delete(id);
  }
}, 30_000).unref();

function buildSignerConfig(config = {}) {
  return {
    enabled: Boolean(config.walletEnabled),
    baseUrl: config.walletSignerBaseUrl || "http://127.0.0.1:18790",
    token: config.walletSignerToken || null,
    tokenConfigured: Boolean(config.walletSignerToken),
    autoConfirm: Boolean(config.walletAutoConfirm)
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
      tokenConfigured: signer.tokenConfigured,
      autoConfirm: signer.autoConfirm
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
          : current.walletSignerToken || null,
      walletAutoConfirm: body.autoConfirm ?? current.walletAutoConfirm ?? false
    });

    const signer = buildSignerConfig(saved);
    return {
      ok: true,
      provider: "wallet",
      enabled: signer.enabled,
      baseUrl: signer.baseUrl,
      tokenConfigured: signer.tokenConfigured,
      autoConfirm: signer.autoConfirm
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
      const signer = buildSignerConfig(config);

      if (!signer.autoConfirm) {
        const pending = createPendingConfirmation("send", request.body || {});
        return {
          status: "pending_confirmation",
          confirmationId: pending.id,
          action: "send",
          payload: pending.payload,
          expiresAt: new Date(pending.expiresAt).toISOString(),
          message: "Transaction requires confirmation. POST /v1/wallet/confirm with { confirmationId } to execute, or POST /v1/wallet/reject to cancel."
        };
      }

      const client = createClientFromConfig(config, fetchImpl);
      return await client.sendTransaction(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/sign-message", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const signer = buildSignerConfig(config);

      if (!signer.autoConfirm) {
        const pending = createPendingConfirmation("sign-message", request.body || {});
        return {
          status: "pending_confirmation",
          confirmationId: pending.id,
          action: "sign-message",
          payload: pending.payload,
          expiresAt: new Date(pending.expiresAt).toISOString(),
          message: "Signature requires confirmation. POST /v1/wallet/confirm with { confirmationId } to execute."
        };
      }

      const client = createClientFromConfig(config, fetchImpl);
      return await client.signMessage(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/sign-typed-data", async (request, reply) => {
    try {
      const config = await loadConfigFn();
      const signer = buildSignerConfig(config);

      if (!signer.autoConfirm) {
        const pending = createPendingConfirmation("sign-typed-data", request.body || {});
        return {
          status: "pending_confirmation",
          confirmationId: pending.id,
          action: "sign-typed-data",
          payload: pending.payload,
          expiresAt: new Date(pending.expiresAt).toISOString(),
          message: "Signature requires confirmation. POST /v1/wallet/confirm with { confirmationId } to execute."
        };
      }

      const client = createClientFromConfig(config, fetchImpl);
      return await client.signTypedData(request.body || {});
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  // Confirmation endpoints
  fastify.post("/v1/wallet/confirm", async (request, reply) => {
    try {
      const { confirmationId } = request.body || {};
      if (!confirmationId) {
        return openAIError(reply, 400, "confirmationId is required", "invalid_request_error", "missing_confirmation_id");
      }

      const entry = consumePendingConfirmation(confirmationId);
      if (!entry) {
        return openAIError(reply, 404, "Confirmation not found or expired", "invalid_request_error", "confirmation_expired");
      }

      const config = await loadConfigFn();
      const client = createClientFromConfig(config, fetchImpl);

      let result;
      switch (entry.action) {
        case "send":
          result = await client.sendTransaction(entry.payload);
          break;
        case "sign-message":
          result = await client.signMessage(entry.payload);
          break;
        case "sign-typed-data":
          result = await client.signTypedData(entry.payload);
          break;
        default:
          return openAIError(reply, 400, `Unknown confirmation action: ${entry.action}`, "invalid_request_error", "unknown_action");
      }

      return { status: "confirmed", action: entry.action, result };
    } catch (error) {
      return openAIError(reply, error.status || 502, error.message, "api_error", error.code || "wallet_error");
    }
  });

  fastify.post("/v1/wallet/reject", async (request, reply) => {
    const { confirmationId } = request.body || {};
    if (!confirmationId) {
      return openAIError(reply, 400, "confirmationId is required", "invalid_request_error", "missing_confirmation_id");
    }

    const entry = consumePendingConfirmation(confirmationId);
    if (!entry) {
      return openAIError(reply, 404, "Confirmation not found or expired", "invalid_request_error", "confirmation_expired");
    }

    return { status: "rejected", action: entry.action, confirmationId };
  });

  fastify.get("/v1/wallet/pending", async () => {
    const now = Date.now();
    const items = [];
    for (const [, entry] of pendingConfirmations) {
      if (now <= entry.expiresAt) {
        items.push({
          confirmationId: entry.id,
          action: entry.action,
          payload: entry.payload,
          createdAt: new Date(entry.createdAt).toISOString(),
          expiresAt: new Date(entry.expiresAt).toISOString()
        });
      }
    }
    return { object: "list", data: items };
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

      const signer = buildSignerConfig(config);

      // Read-only tools always execute immediately
      switch (toolName) {
        case "wallet_address":
          return reply.send(makeRpcResult(id, await client.getAddress()));
        case "wallet_balance":
          return reply.send(makeRpcResult(id, await client.getBalance()));
        case "wallet_policy":
          return reply.send(makeRpcResult(id, await client.getPolicy()));
        case "wallet_send":
        case "wallet_sign_message":
        case "wallet_sign_typed_data": {
          // Write operations respect autoConfirm
          if (!signer.autoConfirm) {
            const actionMap = { wallet_send: "send", wallet_sign_message: "sign-message", wallet_sign_typed_data: "sign-typed-data" };
            const pending = createPendingConfirmation(actionMap[toolName], args);
            return reply.send(makeRpcResult(id, {
              status: "pending_confirmation",
              confirmationId: pending.id,
              action: actionMap[toolName],
              payload: args,
              expiresAt: new Date(pending.expiresAt).toISOString(),
              message: "Action requires user confirmation. Use /v1/wallet/confirm or /v1/wallet/reject."
            }));
          }

          const execMap = {
            wallet_send: () => client.sendTransaction(args),
            wallet_sign_message: () => client.signMessage(args),
            wallet_sign_typed_data: () => client.signTypedData(args)
          };
          return reply.send(makeRpcResult(id, await execMap[toolName]()));
        }
        default:
          return reply.send(makeRpcError(id, new Error(`Unknown wallet tool: ${toolName}`)));
      }
    } catch (error) {
      return reply.send(makeRpcError(id, error));
    }
  });
}
