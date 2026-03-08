import ora from "ora";
import chalk from "chalk";
import { ensureModelInstalled } from "../models/manager.js";
import { formatBytes, formatDuration } from "./utils.js";

export function registerPullCommand(program, deps = {}) {
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const createSpinner = deps.createSpinner || ((text) => ora(text).start());
  const formatBytesFn = deps.formatBytes || formatBytes;
  const formatDurationFn = deps.formatDuration || formatDuration;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  program
    .command("pull")
    .description("Download a model from HuggingFace")
    .argument("<model>", "model alias or HuggingFace path")
    .action(async (model) => {
      const spinner = createSpinner(`Pulling ${model}`);
      try {
        const result = await ensureModelInstalledFn(model, {
          onProgress: ({ downloaded, total, speed, eta }) => {
            const pct = total > 0 ? `${((downloaded / total) * 100).toFixed(1)}%` : "--%";
            spinner.text = `Pulling ${model} ${pct} ${formatBytesFn(downloaded)}/${formatBytesFn(total)} ${formatBytesFn(speed)}/s ETA ${formatDurationFn(eta)}`;
          }
        });

        spinner.succeed(
          result.downloaded
            ? `Installed ${chalk.green(result.metadata.name)} (${formatBytesFn(result.metadata.size)})`
            : `Already installed ${chalk.yellow(result.metadata.name)}`
        );
      } catch (error) {
        spinner.fail(`Failed to pull ${model}: ${error.message}`);
        setExitCode(1);
      }
    });
}
