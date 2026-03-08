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

test("serve command persists config, preloads model, and starts server", async () => {
  const calls = {
    ensured: [],
    loaded: [],
    savedConfig: [],
    started: [],
    logs: []
  };
  const cli = createCli({
    serve: {
      detectHardware: async () => ({
        cpu: { brand: "Test CPU" },
        gpus: [{ model: "Test GPU", vramMb: 4096 }],
        totalVramMb: 4096
      }),
      ensureModelInstalled: async (name) => {
        calls.ensured.push(name);
        return { metadata: { name: "llama-test" } };
      },
      modelPool: {
        async load(name) {
          calls.loaded.push(name);
        }
      },
      saveConfig: async (config) => {
        calls.savedConfig.push(config);
      },
      startServer: async (options) => {
        calls.started.push(options);
      },
      log: (line) => {
        calls.logs.push(line);
      }
    }
  });

  await cli.parseAsync([
    "node",
    "darksol",
    "serve",
    "--host",
    "0.0.0.0",
    "--port",
    "12000",
    "--api-key",
    "secret",
    "--model",
    "llama-3.2-3b"
  ]);

  assert.deepEqual(calls.ensured, ["llama-3.2-3b"]);
  assert.deepEqual(calls.loaded, ["llama-test"]);
  assert.deepEqual(calls.savedConfig, [{ host: "0.0.0.0", port: 12000, apiKey: "secret" }]);
  assert.deepEqual(calls.started, [{ host: "0.0.0.0", port: 12000, apiKey: "secret" }]);
  assert.ok(calls.logs.some((line) => line.includes("Hardware: Test CPU")));
  assert.ok(calls.logs.some((line) => line.includes("Preloaded model llama-test")));
  assert.ok(calls.logs.some((line) => line.includes("darksol server listening on http://0.0.0.0:12000")));
});

test("status command reports online server, hardware, and loaded models", async () => {
  const logs = [];
  const fetchCalls = [];
  const cli = createCli({
    status: {
      loadConfig: async () => ({ host: "127.0.0.1", port: 11435 }),
      detectHardware: async () => ({
        cpu: { brand: "Test CPU", physicalCores: 8 },
        memory: { free: 8 * 1024 ** 3, total: 16 * 1024 ** 3 },
        gpus: [{ model: "Test GPU", vramMb: 8192 }]
      }),
      getThermalStatus: async () => ({ main: 52 }),
      modelPool: {
        listLoaded() {
          return [{ name: "llama-test", gpuLayers: 24, threads: 8 }];
        }
      },
      fetchImpl: async (url) => {
        fetchCalls.push(url);
        return { ok: true };
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "status"]);

  assert.deepEqual(fetchCalls, ["http://127.0.0.1:11435/health"]);
  assert.ok(logs.some((line) => line.includes("Server: online")));
  assert.ok(logs.some((line) => line.includes("CPU: Test CPU")));
  assert.ok(logs.some((line) => line.includes("Loaded Models: 1")));
  assert.ok(logs.some((line) => line.includes("llama-test (gpu_layers=24, threads=8)")));
});

test("list command renders installed models and load state", async () => {
  const logs = [];
  const cli = createCli({
    list: {
      loadConfig: async () => ({
        ollamaEnabled: true,
        ollamaBaseUrl: "http://127.0.0.1:11434"
      }),
      createOllamaClient: () => ({
        async listLocalModels() {
          return [
            {
              name: "llama3.2:latest",
              size: 2_048_000_000,
              quant: "Q4_K_M"
            }
          ];
        }
      }),
      listInstalledModels: async () => ([
        {
          name: "llama-test",
          size: 1_024_000_000,
          quant: "Q4_K_M",
          repo: "meta-llama/Llama-3.2-3B-Instruct"
        },
        {
          name: "embed-test",
          size: 512_000_000,
          quant: "F16",
          repo: "sentence-transformers/all-MiniLM-L6-v2"
        }
      ]),
      modelPool: {
        listLoaded() {
          return [{ name: "llama-test" }];
        }
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "list"]);

  assert.equal(logs.length, 1);
  assert.match(logs[0], /llama-test/);
  assert.match(logs[0], /embed-test/);
  assert.match(logs[0], /ollama\/llama3.2:latest/);
  assert.match(logs[0], /\s+yes\s+/);
  assert.match(logs[0], /\s+no\s+/);
});

test("info command prints installed metadata and runtime details", async () => {
  const logs = [];
  const cli = createCli({
    info: {
      resolveModelSpec: () => ({ localName: "llama-test" }),
      getInstalledModel: async (name) =>
        name === "llama-test"
          ? {
              name: "llama-test",
              repo: "meta-llama/Llama-3.2-3B-Instruct",
              file: "llama-test.gguf",
              size: 1_024_000_000,
              quant: "Q4_K_M",
              downloadedAt: "2026-03-01T00:00:00.000Z"
            }
          : null,
      modelPool: {
        get() {
          return {
            optimized: {
              gpuLayers: 30,
              threads: 12,
              contextSize: 8192
            }
          };
        }
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "info", "llama-3.2-3b"]);

  assert.ok(logs.some((line) => line === "Name: llama-test"));
  assert.ok(logs.some((line) => line === "Loaded: yes"));
  assert.ok(logs.some((line) => line === "GPU Layers: 30"));
  assert.ok(logs.some((line) => line === "Threads: 12"));
  assert.ok(logs.some((line) => line === "Context: 8192"));
});
