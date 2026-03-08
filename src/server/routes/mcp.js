import { createMcpRegistry } from "../../mcp/registry.js";
import { openAIError } from "./errors.js";

export async function registerMcpRoutes(fastify, { mcpRegistry } = {}) {
  const registry = mcpRegistry || createMcpRegistry();

  fastify.get("/v1/mcp/servers", async () => {
    const servers = await registry.list();
    return {
      object: "list",
      data: servers
    };
  });

  fastify.post("/v1/mcp/servers/:name/enable", async (request, reply) => {
    try {
      await registry.setEnabled(request.params?.name, true);
      return {
        object: "mcp.server",
        name: request.params?.name,
        enabled: true
      };
    } catch (error) {
      return openAIError(reply, 404, error.message, "invalid_request_error", "mcp_server_not_found");
    }
  });

  fastify.post("/v1/mcp/servers/:name/disable", async (request, reply) => {
    try {
      await registry.setEnabled(request.params?.name, false);
      return {
        object: "mcp.server",
        name: request.params?.name,
        enabled: false
      };
    } catch (error) {
      return openAIError(reply, 404, error.message, "invalid_request_error", "mcp_server_not_found");
    }
  });
}
