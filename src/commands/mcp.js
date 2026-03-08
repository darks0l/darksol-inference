import { createMcpRegistry } from "../mcp/registry.js";

export function registerMcpCommand(program, deps = {}) {
  const registry = deps.registry || createMcpRegistry();
  const log = deps.log || console.log;
  const errorLog = deps.errorLog || console.error;
  const setExitCode = deps.setExitCode || ((value) => {
    process.exitCode = value;
  });

  const command = program.command("mcp").description("Manage MCP server registry");

  command
    .command("list")
    .description("List configured MCP servers")
    .action(async () => {
      const servers = await registry.list();
      for (const server of servers) {
        log(`${server.name}\tenabled=${server.enabled ? "yes" : "no"}\tendpoint=${server.endpoint}`);
      }
    });

  command
    .command("enable")
    .argument("<name>", "MCP server name")
    .description("Enable a configured MCP server")
    .action(async (name) => {
      try {
        await registry.setEnabled(name, true);
        log(`Enabled MCP server: ${name}`);
      } catch (error) {
        errorLog(error.message);
        setExitCode(1);
      }
    });

  command
    .command("disable")
    .argument("<name>", "MCP server name")
    .description("Disable a configured MCP server")
    .action(async (name) => {
      try {
        await registry.setEnabled(name, false);
        log(`Disabled MCP server: ${name}`);
      } catch (error) {
        errorLog(error.message);
        setExitCode(1);
      }
    });
}
