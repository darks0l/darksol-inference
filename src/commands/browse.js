import Table from "cli-table3";
import { browseModels } from "../models/directory.js";
import { ensureModelInstalled } from "../models/manager.js";

export function registerBrowseCommand(program, deps = {}) {
  const browseModelsFn = deps.browseModels || browseModels;
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const createTable = deps.createTable || ((options) => new Table(options));
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  program
    .command("browse")
    .description("Browse trending GGUF models on HuggingFace")
    .option("--category <category>", "chat|code|vision|embed")
    .option("--sort <sort>", "trending|downloads|recent", "trending")
    .option("--limit <limit>", "max rows", "20")
    .option("--pull <index>", "download model at index")
    .action(async (options) => {
      const models = await browseModelsFn({
        category: options.category,
        sort: options.sort,
        limit: Number(options.limit)
      });

      const table = createTable({
        head: ["#", "Name", "Downloads", "Updated", "Tags"]
      });

      models.forEach((model, index) => {
        table.push([
          index + 1,
          model.id,
          model.downloads,
          model.updatedAt ? model.updatedAt.slice(0, 10) : "-",
          model.tags.slice(0, 3).join(",")
        ]);
      });

      log(table.toString());

      if (options.pull) {
        const index = Number(options.pull) - 1;
        const selected = models[index];
        if (!selected) {
          errorLog("Invalid pull index.");
          setExitCode(1);
          return;
        }

        log(`Pulling ${selected.id} ...`);
        await ensureModelInstalledFn(selected.id);
        log(`Installed ${selected.id}`);
      }
    });
}
