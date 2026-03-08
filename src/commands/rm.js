import chalk from "chalk";
import { removeModel } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";

export function registerRmCommand(program, deps = {}) {
  const removeModelFn = deps.removeModel || removeModel;
  const modelPoolApi = deps.modelPool || modelPool;
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  program
    .command("rm")
    .description("Remove a model from local storage")
    .argument("<model>", "model alias or local name")
    .action(async (model) => {
      try {
        const name = await removeModelFn(model);
        modelPoolApi.unload(name);
        log(`Removed ${chalk.green(name)}`);
      } catch (error) {
        errorLog(`Failed to remove ${model}: ${error.message}`);
        setExitCode(1);
      }
    });
}
