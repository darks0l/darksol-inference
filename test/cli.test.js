import test from "node:test";
import assert from "node:assert/strict";
import { createCli } from "../src/cli.js";

test("cli registers expected commands", () => {
  const cli = createCli();
  const names = cli.commands.map((cmd) => cmd.name());
  assert.deepEqual(
    names.sort(),
    ["browse", "info", "list", "ps", "pull", "rm", "run", "search", "serve", "status"].sort()
  );
});

test("search command prints concise directory rows", async () => {
  const cli = createCli();
  const logs = [];
  const priorFetch = global.fetch;
  const priorLog = console.log;

  global.fetch = async () => ({
    ok: true,
    async json() {
      return [
        {
          id: "meta-llama/Llama-3.2-3B-Instruct",
          downloads: 123456,
          likes: 420,
          pipeline_tag: "text-generation",
          library_name: "transformers",
          lastModified: "2025-02-01T00:00:00.000Z"
        }
      ];
    }
  });
  console.log = (line) => logs.push(line);

  try {
    await cli.parseAsync(["node", "darksol", "search", "llama", "--limit", "1", "--task", "text-generation"]);
  } finally {
    global.fetch = priorFetch;
    console.log = priorLog;
  }

  assert.equal(logs.length, 1);
  assert.match(logs[0], /^meta-llama\/Llama-3.2-3B-Instruct\tdownloads=123456\tlikes=420\ttask=text-generation$/);
});
