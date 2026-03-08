import { Command } from "commander";
import { registerServeCommand } from "./commands/serve.js";
import { registerRunCommand } from "./commands/run.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerListCommand } from "./commands/list.js";
import { registerRmCommand } from "./commands/rm.js";
import { registerPsCommand } from "./commands/ps.js";
import { registerInfoCommand } from "./commands/info.js";
import { registerBrowseCommand } from "./commands/browse.js";
import { registerStatusCommand } from "./commands/status.js";

export function createCli() {
  const program = new Command();
  program
    .name("darksol")
    .description("DARKSOL local inference engine")
    .version("0.1.0");

  registerServeCommand(program);
  registerRunCommand(program);
  registerPullCommand(program);
  registerListCommand(program);
  registerRmCommand(program);
  registerPsCommand(program);
  registerInfoCommand(program);
  registerBrowseCommand(program);
  registerStatusCommand(program);

  return program;
}

export async function runCli(argv = process.argv) {
  const program = createCli();
  await program.parseAsync(argv);
}
