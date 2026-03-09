import { getKeepWarmScheduler } from "../runtime/keep-warm.js";

export function registerKeepWarmCommand(program, deps = {}) {
  const keepWarmScheduler = deps.keepWarmScheduler || getKeepWarmScheduler();
  const log = deps.log || console.log;

  const command = program.command("keepwarm").description("Manage Darksol Engine keep-warm scheduler");

  command
    .command("status")
    .description("Show keep-warm scheduler state")
    .action(async () => {
      const config = await keepWarmScheduler.getConfig();
      const state = keepWarmScheduler.getState();
      log(`Runtime: Darksol Engine`);
      log(`Enabled: ${config.keepWarmEnabled ? "yes" : "no"}`);
      log(`Model: ${config.keepWarmModel || "-"}`);
      log(`Interval (sec): ${config.keepWarmIntervalSec}`);
      log(`Scheduler Active: ${state.active ? "yes" : "no"}`);
      log(`Last Fired: ${state.lastFiredAt || "-"}`);
      log(`Last Result: ${state.lastResult || "never"}`);
    });

  command
    .command("enable")
    .description("Enable keep-warm for a model")
    .requiredOption("--model <name>", "Model name to keep warm")
    .option("--interval <sec>", "Keep-warm interval in seconds", "120")
    .action(async (options) => {
      const next = await keepWarmScheduler.updateConfig({
        enabled: true,
        model: options.model,
        interval: Number(options.interval)
      });
      log(`Runtime: Darksol Engine`);
      log(`Keep-warm enabled for ${next.keepWarmModel} every ${next.keepWarmIntervalSec}s`);
    });

  command
    .command("disable")
    .description("Disable keep-warm scheduler")
    .action(async () => {
      await keepWarmScheduler.updateConfig({ enabled: false });
      log("Runtime: Darksol Engine");
      log("Keep-warm disabled");
    });
}
