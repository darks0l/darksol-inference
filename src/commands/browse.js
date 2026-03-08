import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import Table from "cli-table3";
import { browseModels } from "../models/directory.js";
import { ensureModelInstalled } from "../models/manager.js";

async function promptForModelIndex(models) {
  if (!input.isTTY || !output.isTTY) {
    return null;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question("Enter model # to pull (or press Enter to skip): ")).trim();
    if (!answer) {
      return null;
    }

    const parsed = Number(answer);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > models.length) {
      throw new Error("Invalid pull index.");
    }

    return parsed;
  } finally {
    rl.close();
  }
}

export function registerBrowseCommand(program, deps = {}) {
  const browseModelsFn = deps.browseModels || browseModels;
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const promptForModelIndexFn = deps.promptForModelIndex || promptForModelIndex;
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

      let pullIndex = null;
      if (options.pull) {
        pullIndex = Number(options.pull);
      } else if (models.length > 0) {
        try {
          pullIndex = await promptForModelIndexFn(models);
        } catch (error) {
          errorLog(error.message);
          setExitCode(1);
          return;
        }
      }

      if (pullIndex !== null) {
        const index = pullIndex - 1;
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
