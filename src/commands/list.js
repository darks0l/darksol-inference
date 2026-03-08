import Table from "cli-table3";
import { listInstalledModels } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";
import { loadConfig } from "../lib/config.js";
import { discoverOllamaLocalModels } from "../providers/ollama-local.js";

export function registerListCommand(program, deps = {}) {
  const listInstalledModelsFn = deps.listInstalledModels || listInstalledModels;
  const modelPoolApi = deps.modelPool || modelPool;
  const loadConfigFn = deps.loadConfig || loadConfig;
  const discoverOllamaLocalModelsFn = deps.discoverOllamaLocalModels || discoverOllamaLocalModels;
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
        try {
          ollamaModels = await discoverOllamaLocalModelsFn();
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
          model.id,
          formatBytes(model.size),
          model.quant || "unknown",
          loaded.has(model.id) ? "yes" : "no",
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
