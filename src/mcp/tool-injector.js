const TOOL_NAME_SEPARATOR = "__";

function normalizeToolDefinition(tool) {
  if (!tool || typeof tool !== "object") {
    return null;
  }

  const name = typeof tool.name === "string" ? tool.name.trim() : "";
  if (!name) {
    return null;
  }

  const description = typeof tool.description === "string" ? tool.description : "";
  const inputSchema =
    tool.input_schema && typeof tool.input_schema === "object"
      ? tool.input_schema
      : tool.parameters && typeof tool.parameters === "object"
        ? tool.parameters
        : { type: "object", properties: {} };

  return { name, description, inputSchema };
}

export function encodeToolName(serverName, toolName) {
  const normalizedServer = String(serverName || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_");
  const normalizedTool = String(toolName || "").trim();
  return `${normalizedServer}${TOOL_NAME_SEPARATOR}${normalizedTool}`;
}

export function decodeToolName(encodedName = "") {
  const index = encodedName.indexOf(TOOL_NAME_SEPARATOR);
  if (index === -1) {
    return null;
  }

  const serverAlias = encodedName.slice(0, index);
  const toolName = encodedName.slice(index + TOOL_NAME_SEPARATOR.length);
  if (!serverAlias || !toolName) {
    return null;
  }

  return { serverAlias, toolName };
}

export function buildOpenAITools(servers = []) {
  const tools = [];
  const sortedServers = [...servers]
    .filter((server) => server?.enabled && Array.isArray(server?.toolsSchema) && server.toolsSchema.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const server of sortedServers) {
    const serverTools = [...server.toolsSchema]
      .map(normalizeToolDefinition)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const tool of serverTools) {
      tools.push({
        type: "function",
        function: {
          name: encodeToolName(server.name, tool.name),
          description: tool.description,
          parameters: tool.inputSchema
        }
      });
    }
  }

  return tools;
}

export function hasEnabledTools(servers = []) {
  return buildOpenAITools(servers).length > 0;
}
