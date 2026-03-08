import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { ensureModelInstalled } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { chatCompletion } from "../engine/inference.js";
import { loadConfig } from "../lib/config.js";
import {
  createOllamaClient,
  isOllamaModelId,
  toOllamaModelName
} from "../providers/ollama.js";

export function registerRunCommand(program, deps = {}) {
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const modelPoolApi = deps.modelPool || modelPool;
  const chatCompletionFn = deps.chatCompletion || chatCompletion;
  const loadConfigFn = deps.loadConfig || loadConfig;
  const createOllamaClientFn = deps.createOllamaClient || createOllamaClient;

  program
    .command("run")
    .description("Interactive terminal chat")
    .argument("<model>", "model alias or local name")
    .action(async (model) => {
      const config = await loadConfigFn();

      if (isOllamaModelId(model)) {
        const ollamaModel = toOllamaModelName(model);
        const ollamaClient = createOllamaClientFn({
          enabled: config.ollamaEnabled,
          baseUrl: config.ollamaBaseUrl
        });

        await ollamaClient.listLocalModels();
        console.log(chalk.green(`Model ready: ${model}`));
        console.log("Type /exit to quit, /clear to clear history.");

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
            console.log(`model=${model} provider=ollama endpoint=${config.ollamaBaseUrl}`);
            continue;
          }

          messages.push({ role: "user", content: text });
          output.write(chalk.magenta("assistant> "));

          let response = "";
          await ollamaClient.chat({
            model: ollamaModel,
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

        return;
      }

      const installed = await ensureModelInstalledFn(model, {
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

      const poolItem = await modelPoolApi.load(installed.metadata.name);
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
        await chatCompletionFn({
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
