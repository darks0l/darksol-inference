import ora from "ora";
import chalk from "chalk";
import { ensureModelInstalled } from "../models/manager.js";
import { formatBytes, formatDuration } from "./utils.js";

export function registerPullCommand(program) {
  program
    .command("pull")
    .description("Download a model from HuggingFace")
    .argument("<model>", "model alias or HuggingFace path")
    .action(async (model) => {
      const spinner = ora(`Pulling ${model}`).start();
      try {
        const result = await ensureModelInstalled(model, {
          onProgress: ({ downloaded, total, speed, eta }) => {
            const pct = total > 0 ? `${((downloaded / total) * 100).toFixed(1)}%` : "--%";
            spinner.text = `Pulling ${model} ${pct} ${formatBytes(downloaded)}/${formatBytes(total)} ${formatBytes(speed)}/s ETA ${formatDuration(eta)}`;
          }
        });

        spinner.succeed(
          result.downloaded
            ? `Installed ${chalk.green(result.metadata.name)} (${formatBytes(result.metadata.size)})`
            : `Already installed ${chalk.yellow(result.metadata.name)}`
        );
      } catch (error) {
        spinner.fail(`Failed to pull ${model}: ${error.message}`);
        process.exitCode = 1;
      }
    });
}
