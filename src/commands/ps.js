import Table from "cli-table3";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerPsCommand(program) {
  program
    .command("ps")
    .description("Show loaded models")
    .action(() => {
      const loaded = modelPool.listLoaded();
      if (loaded.length === 0) {
        console.log("No models loaded.");
        return;
      }

      const table = new Table({
        head: ["Name", "Size", "Quant", "GPU Layers", "Threads", "Last Used"]
      });

      for (const model of loaded) {
        table.push([
          model.name,
          formatBytes(model.size),
          model.quant || "unknown",
          model.gpuLayers,
          model.threads,
          model.lastUsed
        ]);
      }

      console.log(table.toString());
    });
}
