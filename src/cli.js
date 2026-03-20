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
import { registerSearchCommand } from "./commands/search.js";
import { registerUsageCommand } from "./commands/usage.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerRuntimeCommand } from "./commands/runtime.js";
import { registerKeepWarmCommand } from "./commands/keepwarm.js";
import { registerAgentCommand } from "./commands/agent.js";

export function createCli(deps = {}) {
  const program = new Command();
  program
    .name("darksol")
    .description("DARKSOL local inference engine")
    .version("0.1.0");

  registerServeCommand(program, deps.serve);
  registerRunCommand(program, deps.run);
  registerPullCommand(program, deps.pull);
  registerListCommand(program, deps.list);
  registerRmCommand(program, deps.rm);
  registerPsCommand(program, deps.ps);
  registerInfoCommand(program, deps.info);
  registerBrowseCommand(program, deps.browse);
  registerStatusCommand(program, deps.status);
  registerSearchCommand(program, deps.search);
  registerUsageCommand(program, deps.usage);
  registerMcpCommand(program, deps.mcp);
  registerRuntimeCommand(program, deps.runtime);
  registerKeepWarmCommand(program, deps.keepwarm);
  registerAgentCommand(program);

  return program;
}

export async function runCli(argv = process.argv) {
  const program = createCli();
  await program.parseAsync(argv);
}
