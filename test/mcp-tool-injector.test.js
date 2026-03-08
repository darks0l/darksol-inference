import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenAITools, decodeToolName, encodeToolName, hasEnabledTools } from "../src/mcp/tool-injector.js";

test("buildOpenAITools includes only enabled servers with valid tools", () => {
  const servers = [
    {
      name: "CoinGecko",
      enabled: true,
      toolsSchema: [
        {
          name: "price_lookup",
          description: "Lookup token price",
          input_schema: { type: "object", properties: { symbol: { type: "string" } } }
        }
      ]
    },
    {
      name: "DexScreener",
      enabled: false,
      toolsSchema: [{ name: "pairs", input_schema: { type: "object", properties: {} } }]
    }
  ];

  const tools = buildOpenAITools(servers);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, "CoinGecko__price_lookup");
  assert.equal(tools[0].function.parameters.type, "object");
});

test("encode/decode tool names round-trip", () => {
  const encoded = encodeToolName("DefiLlama", "protocols");
  assert.equal(encoded, "DefiLlama__protocols");

  const decoded = decodeToolName(encoded);
  assert.deepEqual(decoded, { serverAlias: "DefiLlama", toolName: "protocols" });
});

test("hasEnabledTools returns false when no enabled tool schemas exist", () => {
  const servers = [{ name: "Etherscan", enabled: true, toolsSchema: [] }];
  assert.equal(hasEnabledTools(servers), false);
});
