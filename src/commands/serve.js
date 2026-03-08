import chalk from "chalk";
import { startServer } from "../server/index.js";
import { detectHardware } from "../hardware/detect.js";
import { ensureModelInstalled, listInstalledModels } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { loadConfig, saveConfig } from "../lib/config.js";

function resolveListenUrl(addressInfo, host, port) {
  if (addressInfo && typeof addressInfo === "object") {
    const actualHost = addressInfo.address?.includes(":") ? `[${addressInfo.address}]` : addressInfo.address;
    return `http://${actualHost}:${addressInfo.port}`;
  }
  return `http://${host}:${port}`;
}

async function unloadAllModels(modelPoolApi) {
  const loaded = modelPoolApi.listLoaded();
  for (const item of loaded) {
    await modelPoolApi.unload(item.name);
  }
}

export function registerServeCommand(program, deps = {}) {
  const detectHardwareFn = deps.detectHardware || detectHardware;
  const ensureModelInstalledFn = deps.ensureModelInstalled || ensureModelInstalled;
  const listInstalledModelsFn = deps.listInstalledModels || listInstalledModels;
  const modelPoolApi = deps.modelPool || modelPool;
  const loadConfigFn = deps.loadConfig || loadConfig;
  const saveConfigFn = deps.saveConfig || saveConfig;
  const startServerFn = deps.startServer || startServer;
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const bindSignal = deps.bindSignal || ((signal, handler) => process.on(signal, handler));
  const unbindSignal = deps.unbindSignal || ((signal, handler) => process.off(signal, handler));

  program
    .command("serve")
    .description("Start the inference API server")
    .option("--port <port>", "port")
    .option("--host <host>", "host")
    .option("--api-key <key>", "API key")
    .option("--model <name>", "preload model")
    .option("--ollama-base-url <url>", "Ollama base URL override")
    .option("--ollama-enabled <state>", "Enable/disable Ollama inventory (true|false)")
    .action(async (options) => {
      const config = await loadConfigFn();
      const port = Number(options.port || config.port || 11435);
      const host = options.host || config.host || "127.0.0.1";
      const apiKey = options.apiKey === undefined ? config.apiKey : options.apiKey;
      const ollamaBaseUrl = options.ollamaBaseUrl;
      const ollamaEnabled = options.ollamaEnabled === undefined
        ? undefined
        : String(options.ollamaEnabled).toLowerCase() === "true";
      const startupLoadedModels = [];

      const hardware = await detectHardwareFn();
      log(chalk.cyan(`Hardware: ${hardware.cpu.brand} | GPUs: ${hardware.gpus.length} | VRAM: ${hardware.totalVramMb}MB`));

      if (!options.model) {
        const installedModels = await listInstalledModelsFn();
        const fallbackModel = config.defaultModel || installedModels[0]?.name;

        if (fallbackModel) {
          try {
            const loaded = await modelPoolApi.load(fallbackModel);
            startupLoadedModels.push(loaded.modelName);
            log(chalk.green(`Preloaded model ${loaded.modelName}`));
          } catch (error) {
            errorLog(`Model preload skipped (${fallbackModel}): ${error.message}`);
          }
        } else {
          errorLog("No models found. Start serving now and pull one with `darksol pull <model>`.");
        }
      } else {
        const install = await ensureModelInstalledFn(options.model);
        const loaded = await modelPoolApi.load(install.metadata.name);
        startupLoadedModels.push(loaded.modelName);
        log(chalk.green(`Preloaded model ${loaded.modelName}`));
      }

      const persistedConfig = await saveConfigFn({
        host,
        port,
        apiKey: apiKey || null,
        ...(ollamaBaseUrl ? { ollamaBaseUrl } : {}),
        ...(ollamaEnabled === undefined ? {} : { ollamaEnabled })
      });
      const nextConfig = persistedConfig || {
        host,
        port,
        apiKey: apiKey || null,
        ollamaBaseUrl: ollamaBaseUrl || config.ollamaBaseUrl,
        ollamaEnabled: ollamaEnabled ?? config.ollamaEnabled
      };
      const server = await startServerFn({
        host,
        port,
        apiKey: nextConfig.apiKey,
        ollamaBaseUrl: nextConfig.ollamaBaseUrl,
        ollamaEnabled: nextConfig.ollamaEnabled
      });
      const listenUrl = resolveListenUrl(server?.server?.address?.(), host, port);
      const loadedSummary = startupLoadedModels.length > 0 ? startupLoadedModels.join(", ") : "none";
      log(chalk.green(`darksol server listening on ${listenUrl}`));
      log(chalk.cyan(`Loaded models: ${loadedSummary}`));

      const shutdown = async (signal) => {
        log(chalk.yellow(`Received ${signal}. Shutting down darksol server...`));
        unbindSignal("SIGINT", onSigint);
        unbindSignal("SIGTERM", onSigterm);
        await server.close();
        await unloadAllModels(modelPoolApi);
        log(chalk.green("Shutdown complete."));
      };

      const onSigint = () => {
        shutdown("SIGINT").catch((error) => {
          errorLog(`Shutdown failed: ${error.message}`);
        });
      };
      const onSigterm = () => {
        shutdown("SIGTERM").catch((error) => {
          errorLog(`Shutdown failed: ${error.message}`);
        });
      };

      bindSignal("SIGINT", onSigint);
      bindSignal("SIGTERM", onSigterm);
    });
}
