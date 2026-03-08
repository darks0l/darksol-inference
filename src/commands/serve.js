import chalk from "chalk";
import { startServer } from "../server/index.js";
import { detectHardware } from "../hardware/detect.js";
import { ensureModelInstalled } from "../models/manager.js";
import { modelPool } from "../engine/pool.js";
import { saveConfig } from "../lib/config.js";

export function registerServeCommand(program) {
  program
    .command("serve")
    .description("Start the inference API server")
    .option("--port <port>", "port", "11435")
    .option("--host <host>", "host", "127.0.0.1")
    .option("--api-key <key>", "API key")
    .option("--model <name>", "preload model")
    .action(async (options) => {
      const port = Number(options.port);
      const host = options.host;
      const apiKey = options.apiKey;

      const hardware = await detectHardware();
      console.log(chalk.cyan(`Hardware: ${hardware.cpu.brand} | GPUs: ${hardware.gpus.length} | VRAM: ${hardware.totalVramMb}MB`));

      if (options.model) {
        const install = await ensureModelInstalled(options.model);
        await modelPool.load(install.metadata.name);
        console.log(chalk.green(`Preloaded model ${install.metadata.name}`));
      }

      await saveConfig({ host, port, apiKey: apiKey || null });
      await startServer({ host, port, apiKey });
      console.log(chalk.green(`darksol server listening on http://${host}:${port}`));
    });
}
