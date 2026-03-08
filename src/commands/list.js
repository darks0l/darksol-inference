import Table from "cli-table3";
import { listInstalledModels } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerListCommand(program) {
  program
    .command("list")
    .description("List installed models")
    .action(async () => {
      const installed = await listInstalledModels();
      const loaded = new Set(modelPool.listLoaded().map((item) => item.name));

      const table = new Table({
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
        console.log("No models installed.");
        return;
      }

      console.log(table.toString());
    });
}
