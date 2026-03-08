import Table from "cli-table3";
import { modelPool } from "../engine/pool.js";
import { formatBytes } from "./utils.js";

export function registerPsCommand(program, deps = {}) {
  const modelPoolApi = deps.modelPool || modelPool;
  const createTable = deps.createTable || ((options) => new Table(options));
  const formatBytesFn = deps.formatBytes || formatBytes;
  const log = deps.log || console.log;

  program
    .command("ps")
    .description("Show loaded models")
    .action(() => {
      const loaded = modelPoolApi.listLoaded();
      if (loaded.length === 0) {
        log("No models loaded.");
        return;
      }

      const table = createTable({
        head: ["Name", "Size", "Quant", "GPU Layers", "Threads", "Last Used"]
      });

      for (const model of loaded) {
        table.push([
          model.name,
          formatBytesFn(model.size),
          model.quant || "unknown",
          model.gpuLayers,
          model.threads,
          model.lastUsed
        ]);
      }

      log(table.toString());
    });
}
