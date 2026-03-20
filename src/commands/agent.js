/**
 * CLI command: darksol agent
 * One-shot deep agent execution or interactive mode.
 */

import { createDarksolAgent } from "../agent/deep-agent.js";
import { loadConfig } from "../lib/config.js";
import chalk from "chalk";
import { createInterface } from "node:readline";

/**
 * Register the agent command.
 * @param {import('commander').Command} program
 */
export function registerAgentCommand(program) {
  program
    .command("agent [message...]")
    .description("Run the deep agent — autonomous task completion with planning, filesystem, and shell tools")
    .option("-m, --model <model>", "Model to use (default: auto — uses configured serve model)")
    .option("--api <url>", "API base URL", "http://127.0.0.1:11435")
    .option("--api-key <key>", "API key for the provider")
    .option("-i, --interactive", "Interactive mode — keep the agent running for follow-ups")
    .option("--cwd <dir>", "Working directory for the agent")
    .option("--max-iterations <n>", "Max tool-call iterations", parseInt, 50)
    .option("-v, --verbose", "Show tool calls and results")
    .option("--no-planning", "Disable the planning/todo system")
    .action(async (messageParts, options) => {
      const config = loadConfig();
      const message = messageParts.join(" ");

      // Resolve model
      let model = options.model || "auto";
      let apiBase = options.api;
      let apiKey = options.apiKey;

      // Check if using an external provider
      if (model.includes("/") || model.startsWith("claude") || model.startsWith("gpt")) {
        // External model — route through Ollama-compatible endpoint or direct
        if (!apiKey && config.providers) {
          // Try to find a matching API key
          if (model.includes("claude") && config.providers.anthropic) {
            apiKey = config.providers.anthropic.apiKey;
            apiBase = "https://api.anthropic.com";
          } else if (model.includes("gpt") && config.providers.openai) {
            apiKey = config.providers.openai.apiKey;
            apiBase = "https://api.openai.com";
          }
        }
      }

      const agent = createDarksolAgent({
        model,
        apiBase,
        apiKey,
        maxIterations: options.maxIterations,
        verbose: options.verbose,
        planning: options.planning,
        cwd: options.cwd,
        onStep: (type, data) => {
          if (type === "thinking") {
            process.stdout.write(chalk.dim("  ⏳ thinking...\r"));
          }
          if (type === "tool_call") {
            const argsPreview = JSON.stringify(data.args).substring(0, 80);
            console.log(chalk.cyan(`  🔧 ${data.name}`) + chalk.dim(` ${argsPreview}`));
          }
          if (type === "tool_result") {
            const preview = data.result.substring(0, 120).replace(/\n/g, " ");
            console.log(chalk.dim(`  📋 ${preview}`));
          }
        },
      });

      if (options.interactive || !message) {
        // Interactive mode
        console.log(chalk.bold.hex("#FFD700")("\n🌑 DARKSOL Deep Agent"));
        console.log(chalk.dim("Type your task. The agent will plan, execute, and report back."));
        console.log(chalk.dim('Type "exit" or Ctrl+C to quit.\n'));

        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const ask = () => {
          rl.question(chalk.hex("#FFD700")("▸ "), async (input) => {
            const trimmed = input.trim();
            if (!trimmed || trimmed === "exit" || trimmed === "quit") {
              console.log(chalk.dim("\n👋 Agent terminated."));
              rl.close();
              return;
            }

            try {
              console.log("");
              const result = await agent.run(trimmed);
              console.log("\n" + chalk.white(result.response));
              console.log(chalk.dim(`\n  [${result.iterations} iterations, ~${result.totalTokensEstimate} tokens]`));
              console.log("");
            } catch (err) {
              console.error(chalk.red(`\n  Error: ${err.message}\n`));
            }

            ask();
          });
        };

        // If initial message was provided, run it first
        if (message) {
          try {
            console.log("");
            const result = await agent.run(message);
            console.log("\n" + chalk.white(result.response));
            console.log(chalk.dim(`\n  [${result.iterations} iterations, ~${result.totalTokensEstimate} tokens]\n`));
          } catch (err) {
            console.error(chalk.red(`\n  Error: ${err.message}\n`));
          }
        }

        ask();
      } else {
        // One-shot mode
        if (!message) {
          console.error(chalk.red("Error: provide a message or use --interactive"));
          process.exit(1);
        }

        console.log(chalk.bold.hex("#FFD700")("🌑 DARKSOL Deep Agent") + chalk.dim(` (${model})\n`));

        try {
          const result = await agent.run(message);
          console.log("\n" + result.response);

          if (result.todos && result.todos.length > 0) {
            console.log(chalk.dim("\n📋 Final task list:"));
            for (const t of result.todos) {
              const icon = t.status === "completed" ? "✅" :
                           t.status === "in_progress" ? "🔄" : "⬜";
              console.log(chalk.dim(`  ${icon} ${t.content}`));
            }
          }

          console.log(chalk.dim(`\n[${result.iterations} iterations, ~${result.totalTokensEstimate} tokens]`));
        } catch (err) {
          console.error(chalk.red(`Error: ${err.message}`));
          process.exit(1);
        }
      }
    });
}
