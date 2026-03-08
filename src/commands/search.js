import { createHfDirectoryClient } from "../models/hf-directory.js";
import { detectHardware } from "../hardware/detect.js";

export function registerSearchCommand(program, deps = {}) {
  const createHfDirectoryClientFn = deps.createHfDirectoryClient || createHfDirectoryClient;
  const detectHardwareFn = deps.detectHardware || detectHardware;
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  program
    .command("search")
    .description("Search HuggingFace models")
    .argument("<query>", "search query")
    .option("--limit <n>", "max number of rows", "10")
    .option("--task <tag>", "pipeline tag filter")
    .option("--sort <sort>", "trending|popular|downloads|recent|likes", "trending")
    .option("--hardware-aware", "filter and annotate models for local hardware fit")
    .option("--fit <fit>", "recommended|will_fit|might_fit|any", "recommended")
    .action(async (query, options) => {
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        errorLog("Invalid --limit. Expected integer between 1 and 100.");
        setExitCode(1);
        return;
      }

      const hardware = options.hardwareAware
        ? {
            fitFilter: options.fit,
            details: await detectHardwareFn()
          }
        : null;
      const directory = createHfDirectoryClientFn();
      const items = await directory.searchModels({
        q: query,
        task: options.task,
        limit,
        sort: options.sort,
        hardware
      });

      if (!items.length) {
        log("No models found.");
        return;
      }

      for (const model of items) {
        const compatibility = model.compatibility?.label || "-";
        log(`${model.id}\tdownloads=${model.downloads}\tlikes=${model.likes}\ttask=${model.pipeline_tag || "-"}\tcompat=${compatibility}`);
      }
    });
}
