export const ROUTE_CONTRACT = [
  {
    method: "GET",
    path: "/health",
    summary: "Service health check",
    responses: {
      200: "Service status payload"
    }
  },
  {
    method: "GET",
    path: "/web/{filePath}",
    summary: "Serve local web shell files (loopback only)",
    parameters: [
      {
        name: "filePath",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "Static web file",
      403: "Remote clients are blocked",
      404: "File not found"
    }
  },
  {
    method: "GET",
    path: "/assets/{filePath}",
    summary: "Serve local asset files (loopback only)",
    parameters: [
      {
        name: "filePath",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "Static asset file",
      403: "Remote clients are blocked",
      404: "File not found"
    }
  },
  {
    method: "GET",
    path: "/v1/models",
    summary: "List installed models in OpenAI list format (DARKSOL + Ollama when enabled)",
    auth: "bearer",
    responses: {
      200: "Model list",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/ollama/models",
    summary: "List Ollama local models",
    auth: "bearer",
    responses: {
      200: "Model list",
      400: "Ollama provider disabled",
      502: "Ollama unavailable",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/models/pull",
    summary: "Download and register a model from HuggingFace",
    auth: "bearer",
    responses: {
      200: "Model pull result",
      400: "Invalid request",
      401: "Missing or invalid API key",
      502: "Upstream pull failure"
    }
  },
  {
    method: "POST",
    path: "/v1/models/import-ollama",
    summary: "Import an Ollama-local model into Darksol model registry",
    auth: "bearer",
    responses: {
      200: "Model import result",
      400: "Invalid request",
      401: "Missing or invalid API key",
      404: "Model not found"
    }
  },
  {
    method: "GET",
    path: "/v1/directory/models",
    summary: "Search HuggingFace model directory",
    auth: "bearer",
    parameters: [
      {
        name: "q",
        in: "query",
        required: false,
        schema: {
          type: "string"
        }
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100
        }
      },
      {
        name: "task",
        in: "query",
        required: false,
        schema: {
          type: "string"
        }
      },
      {
        name: "sort",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["trending", "popular", "downloads", "recent", "likes"]
        }
      },
      {
        name: "hardware_aware",
        in: "query",
        required: false,
        schema: {
          type: "boolean"
        }
      },
      {
        name: "fit",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["recommended", "will_fit", "might_fit", "any"]
        }
      }
    ],
    responses: {
      200: "Directory search result",
      400: "Invalid query parameters",
      401: "Missing or invalid API key",
      502: "Upstream directory unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/bankr/health",
    summary: "Bankr gateway config status",
    auth: "bearer",
    responses: {
      200: "Bankr gateway health payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/bankr/config",
    summary: "Get Bankr gateway runtime config (non-secret)",
    auth: "bearer",
    responses: {
      200: "Bankr config payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/bankr/config",
    summary: "Update Bankr gateway runtime config",
    auth: "bearer",
    responses: {
      200: "Bankr config update result",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/bankr/models",
    summary: "List Bankr cloud models",
    auth: "bearer",
    responses: {
      200: "Model list",
      401: "Missing or invalid API key",
      502: "Bankr unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/bankr/usage",
    summary: "Get Bankr usage summary",
    auth: "bearer",
    responses: {
      200: "Usage summary",
      401: "Missing or invalid API key",
      502: "Bankr unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/health",
    summary: "Wallet signer health/config status",
    auth: "bearer",
    responses: {
      200: "Wallet health payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/config",
    summary: "Get wallet signer bridge config (non-secret)",
    auth: "bearer",
    responses: {
      200: "Wallet config payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/config",
    summary: "Update wallet signer bridge config",
    auth: "bearer",
    responses: {
      200: "Wallet config update payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/address",
    summary: "Get active signer wallet address",
    auth: "bearer",
    responses: {
      200: "Wallet address payload",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/balance",
    summary: "Get active signer wallet balances",
    auth: "bearer",
    responses: {
      200: "Wallet balance payload",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/policy",
    summary: "Get signer policy controls/limits",
    auth: "bearer",
    responses: {
      200: "Wallet policy payload",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/send",
    summary: "Send transaction via wallet signer",
    auth: "bearer",
    responses: {
      200: "Transaction result",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/sign-message",
    summary: "Sign plaintext message via wallet signer",
    auth: "bearer",
    responses: {
      200: "Message signature payload",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/sign-typed-data",
    summary: "Sign EIP-712 typed data via wallet signer",
    auth: "bearer",
    responses: {
      200: "Typed data signature payload",
      400: "Wallet bridge disabled",
      401: "Missing or invalid API key",
      502: "Signer unavailable"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/confirm",
    summary: "Confirm a pending wallet write operation",
    auth: "bearer",
    responses: {
      200: "Confirmed action result",
      400: "Missing confirmationId",
      401: "Missing or invalid API key",
      404: "Confirmation not found or expired"
    }
  },
  {
    method: "POST",
    path: "/v1/wallet/reject",
    summary: "Reject a pending wallet write operation",
    auth: "bearer",
    responses: {
      200: "Rejection acknowledgement",
      400: "Missing confirmationId",
      401: "Missing or invalid API key",
      404: "Confirmation not found or expired"
    }
  },
  {
    method: "GET",
    path: "/v1/wallet/pending",
    summary: "List pending wallet confirmations",
    auth: "bearer",
    responses: {
      200: "Pending confirmations list",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/wallet/mcp",
    summary: "Local MCP bridge for wallet tools (used by model tool-calls)",
    responses: {
      200: "JSON-RPC result/error"
    }
  },
  {
    method: "GET",
    path: "/v1/app/meta",
    summary: "App bootstrap metadata and route inventory",
    auth: "bearer",
    responses: {
      200: "Metadata payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/app/usage",
    summary: "Local inference usage and cost totals",
    auth: "bearer",
    responses: {
      200: "Usage payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/runtime/status",
    summary: "Darksol Engine runtime status plus keep-warm state",
    auth: "bearer",
    responses: {
      200: "Runtime status payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/start",
    summary: "Start managed Darksol Engine runtime",
    auth: "bearer",
    responses: {
      200: "Runtime start result",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/stop",
    summary: "Stop managed Darksol Engine runtime",
    auth: "bearer",
    responses: {
      200: "Runtime stop result",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/restart",
    summary: "Restart managed Darksol Engine runtime",
    auth: "bearer",
    responses: {
      200: "Runtime restart result",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/runtime/ports",
    summary: "Check if a host/port is available for runtime binding",
    auth: "bearer",
    responses: {
      200: "Port availability payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/ports/find",
    summary: "Find a free port for runtime binding",
    auth: "bearer",
    responses: {
      200: "Found free port",
      400: "Invalid start port",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/config",
    summary: "Update runtime network config (host/port)",
    auth: "bearer",
    responses: {
      200: "Runtime config update result",
      400: "Invalid host/port",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/runtime/keepwarm",
    summary: "Get Darksol Engine keep-warm configuration",
    auth: "bearer",
    responses: {
      200: "Keep-warm configuration payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/runtime/keepwarm",
    summary: "Update Darksol Engine keep-warm configuration",
    auth: "bearer",
    responses: {
      200: "Keep-warm update result",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/mcp/servers",
    summary: "List configured MCP servers",
    auth: "bearer",
    responses: {
      200: "MCP server list",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/mcp/servers/{name}/enable",
    summary: "Enable a configured MCP server",
    auth: "bearer",
    parameters: [
      {
        name: "name",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "MCP server enabled",
      401: "Missing or invalid API key",
      404: "MCP server not found"
    }
  },
  {
    method: "POST",
    path: "/v1/mcp/servers/{name}/disable",
    summary: "Disable a configured MCP server",
    auth: "bearer",
    parameters: [
      {
        name: "name",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "MCP server disabled",
      401: "Missing or invalid API key",
      404: "MCP server not found"
    }
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    summary: "OpenAI-compatible chat completions",
    auth: "bearer",
    responses: {
      200: "Chat completion result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  },
  {
    method: "POST",
    path: "/v1/completions",
    summary: "OpenAI-compatible text completions",
    auth: "bearer",
    responses: {
      200: "Text completion result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    summary: "OpenAI-compatible embeddings",
    auth: "bearer",
    responses: {
      200: "Embedding result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  }
];

export function getRouteInventory() {
  return ROUTE_CONTRACT.map((route) => ({
    method: route.method,
    path: route.path
  }));
}

export function buildOpenApiPaths() {
  const paths = {};

  for (const route of ROUTE_CONTRACT) {
    const method = route.method.toLowerCase();
    const operation = {
      summary: route.summary,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([statusCode, description]) => [
          statusCode,
          { description }
        ])
      )
    };

    if (route.auth === "bearer") {
      operation.security = [{ bearerAuth: [] }];
    }

    if (route.parameters?.length) {
      operation.parameters = route.parameters;
    }

    paths[route.path] = paths[route.path] || {};
    paths[route.path][method] = operation;
  }

  return paths;
}
