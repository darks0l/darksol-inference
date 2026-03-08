import chalk from "chalk";
import { startServer } from "../server/index.js";
import { detectHardware } from "../hardware/detect.js";
import { ensureModelInstalled } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { saveConfig } from "../lib/config.js";

export function registerServeCommand(program, deps = {}) {
  const detectHardwareFn = deps.detectHardware || detectHardware;
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const modelPoolApi = deps.modelPool || modelPool;
  const saveConfigFn = deps.saveConfig || saveConfig;
  const startServerFn = deps.startServer || startServer;
  const log = deps.log || console.log;

  program
    .command("serve")
    .description("Start the inference API server")
    .option("--port <port>", "port", "11435")
    .option("--host <host>", "host", "127.0.0.1")
    .option("--api-key <key>", "API key")
    .option("--model <name>", "preload model")
    .option("--ollama-base-url <url>", "Ollama base URL override")
    .option("--ollama-enabled <state>", "Enable/disable Ollama inventory (true|false)")
    .action(async (options) => {
      const port = Number(options.port);
      const host = options.host;
      const apiKey = options.apiKey;
      const ollamaBaseUrl = options.ollamaBaseUrl;
      const ollamaEnabled = options.ollamaEnabled === undefined
        ? undefined
        : String(options.ollamaEnabled).toLowerCase() === "true";

      const hardware = await detectHardwareFn();
      log(chalk.cyan(`Hardware: ${hardware.cpu.brand} | GPUs: ${hardware.gpus.length} | VRAM: ${hardware.totalVramMb}MB`));

      if (options.model) {
        const install = await ensureModelInstalledFn(options.model);
        await modelPoolApi.load(install.metadata.name);
        log(chalk.green(`Preloaded model ${install.metadata.name}`));
      }

      await saveConfigFn({
        host,
        port,
        apiKey: apiKey || null,
        ...(ollamaBaseUrl ? { ollamaBaseUrl } : {}),
        ...(ollamaEnabled === undefined ? {} : { ollamaEnabled })
      });
      await startServerFn({
        host,
        port,
        apiKey,
        ...(ollamaBaseUrl ? { ollamaBaseUrl } : {}),
        ...(ollamaEnabled === undefined ? {} : { ollamaEnabled })
      });
      log(chalk.green(`darksol server listening on http://${host}:${port}`));
    });
}
