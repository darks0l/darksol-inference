import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadConfig() {
  const configPath = path.resolve(__dirname, "../config/desktop.config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

async function bootstrap() {
  const config = await loadConfig();
  const summary = {
    appName: config.appName,
    appId: config.appId,
    window: config.window,
    shellMirrorUrl: config.shellMirrorUrl
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

bootstrap().catch((error) => {
  process.stderr.write(`desktop bootstrap placeholder failed: ${error.message}\n`);
  process.exitCode = 1;
});
