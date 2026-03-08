import Table from "cli-table3";
import { listInstalledModels } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerListCommand(program, deps = {}) {
  const listInstalledModelsFn = deps.listInstalledModels || listInstalledModels;
  const modelPoolApi = deps.modelPool || modelPool;
  const createTable = deps.createTable || ((options) => new Table(options));
  const log = deps.log || console.log;

  program
    .command("list")
    .description("List installed models")
    .action(async () => {
      const installed = await listInstalledModelsFn();
      const loaded = new Set(modelPoolApi.listLoaded().map((item) => item.name));

      const table = createTable({
        head: ["Name", "Size", "Quant", "Loaded", "Source"]
      });

      for (const model of installed) {
        table.push([
          model.name,
          formatBytes(model.size),
          model.quant || "unknown",
          loaded.has(model.name) ? "yes" : "no",
          model.repo
        ]);
      }

      if (installed.length === 0) {
        log("No models installed.");
        return;
      }

      log(table.toString());
    });
}
