import assert from "node:assert/strict";
import test from "node:test";
import { McpExecutor } from "../src/mcp/executor.js";

test("executor routes tool call to matching server endpoint", async () => {
  const fetchCalls = [];
  const executor = new McpExecutor({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { result: { price: 42000 } };
        }
      };
    }
  });

  const result = await executor.executeToolCall({
    toolCall: {
      id: "call-1",
      function: {
        name: "CoinGecko__price_lookup",
        arguments: "{\"symbol\":\"BTC\"}"
      }
    },
    servers: [
      {
        name: "CoinGecko",
        endpoint: "https://example.com/mcp",
        enabled: true,
        auth: { type: "none" }
      }
    ]
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://example.com/mcp");
  const payload = JSON.parse(fetchCalls[0].init.body);
  assert.equal(payload.method, "tools/call");
  assert.equal(payload.params.name, "price_lookup");
  assert.equal(payload.params.arguments.symbol, "BTC");
  assert.equal(result.result.price, 42000);
  assert.equal(result.toolMessage.role, "tool");
});

test("executor injects bearer token auth header when configured", async () => {
  const executor = new McpExecutor({
    fetchImpl: async (_url, init) => ({
      ok: true,
      async json() {
        return { result: { ok: true, authHeader: init.headers.authorization } };
      }
    })
  });

  const result = await executor.executeToolCall({
    toolCall: {
      id: "call-2",
      function: {
        name: "Etherscan__tx_by_hash",
        arguments: "{}"
      }
    },
    servers: [
      {
        name: "Etherscan",
        endpoint: "https://example.com/mcp",
        enabled: true,
        auth: { type: "bearer", token: "secret-token" }
      }
    ]
  });

  assert.equal(result.result.authHeader, "Bearer secret-token");
});

test("executor throws when tool server is missing", async () => {
  const executor = new McpExecutor();
  await assert.rejects(
    executor.executeToolCall({
      toolCall: {
        id: "call-3",
        function: { name: "Missing__action", arguments: "{}" }
      },
      servers: []
    }),
    /No MCP server mapped/
  );
});
