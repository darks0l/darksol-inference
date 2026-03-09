import { getRuntimeManager } from "../runtime/manager.js";
import { formatDuration } from "./utils.js";

export function registerRuntimeCommand(program, deps = {}) {
  const runtimeManager = deps.runtimeManager || getRuntimeManager();
  const log = deps.log || console.log;

  const command = program.command("runtime").description("Manage Darksol Engine runtime lifecycle");

  command
    .command("status")
    .description("Show Darksol Engine runtime status")
    .action(async () => {
      const status = await runtimeManager.getStatus();
      log(`Runtime: Darksol Engine`);
      log(`Status: ${status.status}`);
      log(`PID: ${status.pid ?? "-"}`);
      log(`Port: ${status.port ?? "-"}`);
      log(`Uptime: ${status.uptimeSec == null ? "--" : formatDuration(status.uptimeSec)}`);
      log(`Loaded Models: ${status.loadedModelsCount ?? 0}`);
    });

  command
    .command("start")
    .description("Start managed Darksol Engine runtime")
    .action(async () => {
      const status = await runtimeManager.start();
      log(`Runtime: Darksol Engine`);
      log(`Status: ${status.status}`);
      log(`PID: ${status.pid}`);
      log(`Port: ${status.port}`);
    });

  command
    .command("stop")
    .description("Stop managed Darksol Engine runtime")
    .action(async () => {
      const status = await runtimeManager.stop();
      log(`Runtime: Darksol Engine`);
      log(`Status: ${status.status}`);
    });

  command
    .command("restart")
    .description("Restart managed Darksol Engine runtime")
    .action(async () => {
      const status = await runtimeManager.restart();
      log(`Runtime: Darksol Engine`);
      log(`Status: ${status.status}`);
      log(`PID: ${status.pid}`);
      log(`Port: ${status.port}`);
    });
}
