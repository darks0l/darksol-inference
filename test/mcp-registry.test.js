import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { McpRegistry } from "../src/mcp/registry.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "darksol-mcp-registry-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("registry loads preconfigured servers by default", async () => {
  const dir = await makeTempDir();
  const registry = new McpRegistry({
    filePath: path.join(dir, "mcp-servers.json"),
    ensureDirs: async () => {
      await fs.mkdir(dir, { recursive: true });
    }
  });

  const servers = await registry.list();
  const names = servers.map((server) => server.name);

  assert.deepEqual(names.sort(), ["CoinGecko", "DefiLlama", "DexScreener", "Etherscan"].sort());
  assert.ok(servers.every((server) => server.enabled === false));
});

test("registry persists enabled state changes", async () => {
  const dir = await makeTempDir();
  const filePath = path.join(dir, "mcp-servers.json");
  const registry = new McpRegistry({
    filePath,
    ensureDirs: async () => {
      await fs.mkdir(dir, { recursive: true });
    }
  });

  await registry.setEnabled("CoinGecko", true);
  const reloaded = await registry.list();
  const coinGecko = reloaded.find((server) => server.name === "CoinGecko");

  assert.equal(coinGecko.enabled, true);
  const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.ok(Array.isArray(raw));
  assert.equal(raw.find((server) => server.name === "CoinGecko").enabled, true);
});

test("registry throws for unknown server names", async () => {
  const dir = await makeTempDir();
  const registry = new McpRegistry({
    filePath: path.join(dir, "mcp-servers.json"),
    ensureDirs: async () => {
      await fs.mkdir(dir, { recursive: true });
    }
  });

  await assert.rejects(
    registry.setEnabled("MissingServer", true),
    /Unknown MCP server/
  );
});
