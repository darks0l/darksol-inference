import { decodeToolName } from "./tool-injector.js";

function buildAuthHeaders(authConfig = {}) {
  if (!authConfig || typeof authConfig !== "object") {
    return {};
  }

  if (authConfig.type === "bearer" && authConfig.token) {
    return { authorization: `Bearer ${authConfig.token}` };
  }

  if (authConfig.type === "apiKey" && authConfig.headerName && authConfig.key) {
    return { [authConfig.headerName]: authConfig.key };
  }

  return {};
}

function resolveServerByAlias(servers, serverAlias) {
  const normalizedAlias = String(serverAlias || "").toLowerCase();
  return servers.find((server) => server.name.toLowerCase().replace(/\s+/g, "_") === normalizedAlias);
}

function parseToolArguments(rawArguments) {
  if (rawArguments === undefined || rawArguments === null || rawArguments === "") {
    return {};
  }

  if (typeof rawArguments === "object") {
    return rawArguments;
  }

  try {
    return JSON.parse(String(rawArguments));
  } catch {
    throw new Error("tool_call arguments must be valid JSON");
  }
}

function formatToolResultContent(result) {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result);
}

export class McpExecutor {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
  }

  async executeToolCall({ toolCall, servers }) {
    const functionCall = toolCall?.function || {};
    const decoded = decodeToolName(functionCall.name);
    if (!decoded) {
      throw new Error(`Invalid MCP tool name: ${functionCall.name || "unknown"}`);
    }

    const server = resolveServerByAlias(servers || [], decoded.serverAlias);
    if (!server) {
      throw new Error(`No MCP server mapped for alias: ${decoded.serverAlias}`);
    }
    if (!server.enabled) {
      throw new Error(`MCP server is disabled: ${server.name}`);
    }
    if (!server.endpoint) {
      throw new Error(`MCP server endpoint is missing: ${server.name}`);
    }

    const args = parseToolArguments(functionCall.arguments);
    const response = await this.fetchImpl(server.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildAuthHeaders(server.auth)
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: toolCall?.id || `tool-${Date.now()}`,
        method: "tools/call",
        params: {
          name: decoded.toolName,
          arguments: args
        }
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const errorMessage = payload?.error?.message || `MCP request failed (${response.status})`;
      throw new Error(errorMessage);
    }

    if (payload?.error) {
      throw new Error(payload.error.message || "MCP tool error");
    }

    const result = payload?.result ?? payload;
    return {
      server: server.name,
      tool: decoded.toolName,
      result,
      toolMessage: {
        role: "tool",
        tool_call_id: toolCall?.id || null,
        name: functionCall.name,
        content: formatToolResultContent(result)
      }
    };
  }
}

export function createMcpExecutor(options = {}) {
  return new McpExecutor(options);
}
