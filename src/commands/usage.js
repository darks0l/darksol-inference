import { readUsageStats } from "../lib/cost-tracker.js";

export function registerUsageCommand(program, deps = {}) {
  const readUsageStatsFn = deps.readUsageStats || readUsageStats;
  const log = deps.log || console.log;

  program
    .command("usage")
    .description("Show accumulated local usage and cost stats")
    .action(async () => {
      const stats = await readUsageStatsFn();
      log(`Runs: ${stats.total_runs}`);
      log(`Tokens in: ${stats.total_tokens_in}`);
      log(`Tokens out: ${stats.total_tokens_out}`);
      log(`Tokens total: ${stats.total_tokens}`);
      log(`Cost total: ${stats.total_cost.toFixed(2)}`);
    });
}
