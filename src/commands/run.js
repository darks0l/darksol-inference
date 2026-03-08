import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { ensureModelInstalled } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { chatCompletion } from "../engine/inference.js";

export function registerRunCommand(program) {
  program
    .command("run")
    .description("Interactive terminal chat")
    .argument("<model>", "model alias or local name")
    .action(async (model) => {
      const installed = await ensureModelInstalled(model, {
        onProgress: ({ downloaded, total }) => {
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            output.write(`\rDownloading ${model} ${pct}%`);
          }
        }
      });

      if (installed.downloaded) {
        output.write("\n");
      }

      const poolItem = await modelPool.load(installed.metadata.name);
      console.log(chalk.green(`Model ready: ${installed.metadata.name}`));
      console.log("Type /exit to quit, /info for runtime info, /clear to clear history.");

      const rl = readline.createInterface({ input, output });
      const messages = [];

      while (true) {
        const text = (await rl.question(chalk.cyan("you> "))).trim();
        if (!text) {
          continue;
        }

        if (text === "/exit") {
          rl.close();
          break;
        }

        if (text === "/clear") {
          messages.length = 0;
          console.log("Chat history cleared.");
          continue;
        }

        if (text === "/info") {
          console.log(`model=${poolItem.modelName} gpu_layers=${poolItem.optimized.gpuLayers} threads=${poolItem.optimized.threads}`);
          continue;
        }

        messages.push({ role: "user", content: text });
        output.write(chalk.magenta("assistant> "));

        let response = "";
        await chatCompletion({
          context: poolItem.context,
          messages,
          stream: true,
          onTextChunk: (chunk) => {
            response += chunk;
            output.write(chunk);
          }
        });

        output.write("\n");
        messages.push({ role: "assistant", content: response });
      }
    });
}
