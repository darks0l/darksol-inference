import Table from "cli-table3";
import { listInstalledModels } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";
import { loadConfig } from "../lib/config.js";
import { createOllamaClient, toOllamaModelId } from "../providers/ollama.js";

export function registerListCommand(program, deps = {}) {
  const listInstalledModelsFn = deps.listInstalledModels || listInstalledModels;
  const modelPoolApi = deps.modelPool || modelPool;
  const loadConfigFn = deps.loadConfig || loadConfig;
  const createOllamaClientFn = deps.createOllamaClient || createOllamaClient;
  const createTable = deps.createTable || ((options) => new Table(options));
  const log = deps.log || console.log;

  program
    .command("list")
    .description("List installed models")
    .action(async () => {
      const config = await loadConfigFn();
      const installed = await listInstalledModelsFn();
      const loaded = new Set(modelPoolApi.listLoaded().map((item) => item.name));
      let ollamaModels = [];

      if (config.ollamaEnabled) {
        const ollamaClient = createOllamaClientFn({
          enabled: config.ollamaEnabled,
          baseUrl: config.ollamaBaseUrl
        });

        try {
          ollamaModels = await ollamaClient.listLocalModels();
        } catch {
          ollamaModels = [];
        }
      }

      const table = createTable({
        head: ["Name", "Size", "Quant", "Loaded", "Source"]
      });

      for (const model of installed) {
        table.push([
          model.name,
          formatBytes(model.size),
          model.quant || "unknown",
          loaded.has(model.name) ? "yes" : "no",
          `darksol:${model.repo}`
        ]);
      }

      for (const model of ollamaModels) {
        table.push([
          toOllamaModelId(model.name),
          formatBytes(model.size),
          model.quant || "unknown",
          "n/a",
          "ollama:local"
        ]);
      }

      if (installed.length === 0 && ollamaModels.length === 0) {
        log("No models installed.");
        return;
      }

      log(table.toString());
    });
}
