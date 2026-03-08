import test from "node:test";
import assert from "node:assert/strict";
import { createCli } from "../src/cli.js";

test("cli registers expected commands", () => {
  const cli = createCli();
  const names = cli.commands.map((cmd) => cmd.name());
  assert.deepEqual(names.sort(), ["browse", "info", "list", "ps", "pull", "rm", "run", "serve", "status"].sort());
});
