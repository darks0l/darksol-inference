import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import chalk from "chalk";
import { ensureModelInstalled } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { chatCompletion } from "../engine/inference.js";
import { isOllamaModelId, toOllamaModelId, toOllamaModelName } from "../providers/ollama.js";
import { discoverOllamaLocalModels, resolveOllamaLocalModel } from "../providers/ollama-local.js";

export function registerRunCommand(program, deps = {}) {
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const modelPoolApi = deps.modelPool || modelPool;
  const chatCompletionFn = deps.chatCompletion || chatCompletion;
  const discoverOllamaLocalModelsFn = deps.discoverOllamaLocalModels || discoverOllamaLocalModels;
  const resolveOllamaLocalModelFn = deps.resolveOllamaLocalModel || resolveOllamaLocalModel;

  program
    .command("run")
    .description("Interactive terminal chat or one-shot prompt")
    .argument("<model>", "model alias or local name")
    .argument("[prompt...]", "optional one-shot prompt")
    .action(async (model, promptParts = []) => {
      const oneShotPrompt = Array.isArray(promptParts) ? promptParts.join(" ").trim() : "";
      let poolItem;
      let modelReadyName = model;
      let infoLine = "";

      if (isOllamaModelId(model)) {
        const requestedOllamaName = toOllamaModelName(model);
        const discoveredModels = await discoverOllamaLocalModelsFn();
        const discoveredModel = await resolveOllamaLocalModelFn(requestedOllamaName, {
          models: discoveredModels
        });

        if (!discoveredModel) {
          throw new Error(`Ollama model not found locally: ${requestedOllamaName}`);
        }

        const localModelId = toOllamaModelId(discoveredModel.name);
        modelReadyName = localModelId;

        poolItem = await modelPoolApi.load(localModelId, {
          modelPath: discoveredModel.ggufPath,
          metadata: {
            name: localModelId,
            repo: `ollama/${discoveredModel.name}`,
            file: path.basename(discoveredModel.ggufPath),
            size: discoveredModel.size,
            quant: discoveredModel.quant,
            family: discoveredModel.family,
            parameterSize: discoveredModel.parameterSize,
            downloadedAt: discoveredModel.modifiedAt
          }
        });

        infoLine = `model=${poolItem.modelName} provider=ollama-local gpu_layers=${poolItem.optimized.gpuLayers} threads=${poolItem.optimized.threads} path=${poolItem.modelPath}`;
      } else {
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

        poolItem = await modelPoolApi.load(installed.metadata.name);
        modelReadyName = installed.metadata.name;
        infoLine = `model=${poolItem.modelName} gpu_layers=${poolItem.optimized.gpuLayers} threads=${poolItem.optimized.threads}`;
      }

      if (oneShotPrompt) {
        const response = await chatCompletionFn({
          context: poolItem.context,
          messages: [{ role: "user", content: oneShotPrompt }],
          stream: false
        });
        console.log(response);
        return;
      }

      console.log(chalk.green(`Model ready: ${modelReadyName}`));
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
          console.log(infoLine);
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
