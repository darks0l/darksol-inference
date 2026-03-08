import fs from "node:fs/promises";
import path from "node:path";
import { logsRoot, ensureDarksolDirs } from "./paths.js";

const logFile = path.join(logsRoot, "darksol.log");

function serialize(level, message, extra = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...extra
  });
}

export async function log(level, message, extra = {}) {
  const line = serialize(level, message, extra);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
  await ensureDarksolDirs();
  await fs.appendFile(logFile, `${line}\n`, "utf8");
}

export const logger = {
  info: (message, extra) => log("info", message, extra),
  warn: (message, extra) => log("warn", message, extra),
  error: (message, extra) => log("error", message, extra)
};
