import { createHfDirectoryClient } from "../models/hf-directory.js";

export function registerSearchCommand(program) {
  program
    .command("search")
    .description("Search HuggingFace models")
    .argument("<query>", "search query")
    .option("--limit <n>", "max number of rows", "10")
    .option("--task <tag>", "pipeline tag filter")
    .action(async (query, options) => {
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        console.error("Invalid --limit. Expected integer between 1 and 100.");
        process.exitCode = 1;
        return;
      }

      const directory = createHfDirectoryClient();
      const items = await directory.searchModels({
        q: query,
        task: options.task,
        limit
      });

      if (!items.length) {
        console.log("No models found.");
        return;
      }

      for (const model of items) {
        console.log(
          `${model.id}\tdownloads=${model.downloads}\tlikes=${model.likes}\ttask=${model.pipeline_tag || "-"}`
        );
      }
    });
}
