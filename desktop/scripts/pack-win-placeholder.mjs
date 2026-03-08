import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, "../config/packaging.win.json");
const raw = await fs.readFile(configPath, "utf8");
process.stdout.write(`Windows packaging placeholder loaded: ${JSON.parse(raw).target}\n`);
