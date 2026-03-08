import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPENAPI_SPEC } from "../src/server/contract/openapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs", "openapi.json");

await writeFile(outputPath, `${JSON.stringify(OPENAPI_SPEC, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
