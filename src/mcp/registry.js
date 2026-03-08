import fs from "node:fs/promises";
import { ensureDarksolDirs, mcpServersPath } from "../lib/paths.js";

const PRECONFIGURED_SERVERS = [
  {
    name: "CoinGecko",
    endpoint: "https://api.coingecko.com/mcp",
    toolsSchema: [],
    auth: { type: "none" },
    enabled: false
  },
  {
    name: "DexScreener",
    endpoint: "https://api.dexscreener.com/mcp",
    toolsSchema: [],
    auth: { type: "none" },
    enabled: false
  },
  {
    name: "Etherscan",
    endpoint: "https://api.etherscan.io/mcp",
    toolsSchema: [],
    auth: { type: "none" },
    enabled: false
  },
  {
    name: "DefiLlama",
    endpoint: "https://api.llama.fi/mcp",
    toolsSchema: [],
    auth: { type: "none" },
    enabled: false
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeServer(server) {
  return {
    name: String(server?.name || ""),
    endpoint: String(server?.endpoint || ""),
    toolsSchema: Array.isArray(server?.toolsSchema) ? server.toolsSchema : [],
    auth: server?.auth && typeof server.auth === "object" ? server.auth : { type: "none" },
    enabled: Boolean(server?.enabled)
  };
}

function mergeWithPreconfigured(configured = []) {
  const byName = new Map();
  for (const server of PRECONFIGURED_SERVERS) {
    byName.set(server.name.toLowerCase(), normalizeServer(server));
  }

  for (const server of configured) {
    const normalized = normalizeServer(server);
    if (!normalized.name) {
      continue;
    }
    byName.set(normalized.name.toLowerCase(), normalized);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export class McpRegistry {
  constructor({ filePath = mcpServersPath, fsImpl = fs, ensureDirs = ensureDarksolDirs } = {}) {
    this.filePath = filePath;
    this.fs = fsImpl;
    this.ensureDirs = ensureDirs;
  }

  async load() {
    await this.ensureDirs();
    try {
      const raw = await this.fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return clone(mergeWithPreconfigured());
      }
      return clone(mergeWithPreconfigured(parsed));
    } catch {
      return clone(mergeWithPreconfigured());
    }
  }

  async save(servers) {
    await this.ensureDirs();
    const nextServers = mergeWithPreconfigured(servers);
    await this.fs.writeFile(this.filePath, `${JSON.stringify(nextServers, null, 2)}\n`, "utf8");
    return clone(nextServers);
  }

  async list() {
    return this.load();
  }

  async setEnabled(name, enabled) {
    const targetName = String(name || "").trim().toLowerCase();
    const servers = await this.load();
    let found = false;

    const nextServers = servers.map((server) => {
      if (server.name.toLowerCase() !== targetName) {
        return server;
      }
      found = true;
      return { ...server, enabled: Boolean(enabled) };
    });

    if (!found) {
      throw new Error(`Unknown MCP server: ${name}`);
    }

    return this.save(nextServers);
  }
}

export function createMcpRegistry(options = {}) {
  return new McpRegistry(options);
}

export function getPreconfiguredMcpServers() {
  return clone(PRECONFIGURED_SERVERS);
}
