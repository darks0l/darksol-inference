import Table from "cli-table3";
import { browseModels } from "../models/directory.js";
import { ensureModelInstalled } from "../models/manager.js";

export function registerBrowseCommand(program) {
  program
    .command("browse")
    .description("Browse trending GGUF models on HuggingFace")
    .option("--category <category>", "chat|code|vision|embed")
    .option("--sort <sort>", "trending|downloads|recent", "trending")
    .option("--limit <limit>", "max rows", "20")
    .option("--pull <index>", "download model at index")
    .action(async (options) => {
      const models = await browseModels({
        category: options.category,
        sort: options.sort,
        limit: Number(options.limit)
      });

      const table = new Table({
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

      console.log(table.toString());

      if (options.pull) {
        const index = Number(options.pull) - 1;
        const selected = models[index];
        if (!selected) {
          console.error("Invalid pull index.");
          process.exitCode = 1;
          return;
        }

        console.log(`Pulling ${selected.id} ...`);
        await ensureModelInstalled(selected.id);
        console.log(`Installed ${selected.id}`);
      }
    });
}
