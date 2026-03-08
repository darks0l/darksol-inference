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

test("run command supports one-shot prompt for local models", async () => {
  const logs = [];
  const calls = {
    ensured: [],
    loaded: [],
    completions: []
  };
  const priorLog = console.log;
  console.log = (line) => logs.push(line);

  const cli = createCli({
    run: {
      loadConfig: async () => ({ ollamaEnabled: true, ollamaBaseUrl: "http://127.0.0.1:11434" }),
      ensureModelInstalled: async (name) => {
        calls.ensured.push(name);
        return { downloaded: false, metadata: { name: "llama-test" } };
      },
      modelPool: {
        async load(name) {
          calls.loaded.push(name);
          return { context: { id: "ctx" }, modelName: name, optimized: { gpuLayers: 12, threads: 8 } };
        }
      },
      chatCompletion: async (payload) => {
        calls.completions.push(payload);
        return "local-one-shot";
      }
    }
  });

  try {
    await cli.parseAsync(["node", "darksol", "run", "llama-3.2-3b", "hello", "world"]);
  } finally {
    console.log = priorLog;
  }

  assert.deepEqual(calls.ensured, ["llama-3.2-3b"]);
  assert.deepEqual(calls.loaded, ["llama-test"]);
  assert.equal(calls.completions.length, 1);
  assert.equal(calls.completions[0].stream, false);
  assert.deepEqual(calls.completions[0].messages, [{ role: "user", content: "hello world" }]);
  assert.deepEqual(logs, ["local-one-shot"]);
});

test("run command supports one-shot prompt for ollama/<model>", async () => {
  const logs = [];
  const calls = {
    discovered: 0,
    resolved: [],
    loaded: [],
    completions: []
  };
  const priorLog = console.log;
  console.log = (line) => logs.push(line);

  const cli = createCli({
    run: {
      discoverOllamaLocalModels: async () => {
        calls.discovered += 1;
        return [
          {
            id: "ollama/llama3.2:latest",
            name: "llama3.2:latest",
            size: 2_048_000_000,
            quant: "Q4_K_M",
            family: "llama",
            parameterSize: "3B",
            modifiedAt: "2026-03-08T00:00:00.000Z",
            ggufPath: "/tmp/ollama/blobs/sha256-abc"
          }
        ];
      },
      resolveOllamaLocalModel: async (modelName, { models }) => {
        calls.resolved.push({ modelName, models });
        return models[0];
      },
      modelPool: {
        async load(name, options) {
          calls.loaded.push({ name, options });
          return { context: { id: "ctx" }, modelName: name, optimized: { gpuLayers: 12, threads: 8 } };
        }
      },
      chatCompletion: async (payload) => {
        calls.completions.push(payload);
        return "ollama-one-shot";
      }
    }
  });

  try {
    await cli.parseAsync(["node", "darksol", "run", "ollama/llama3.2:latest", "summarize", "this"]);
  } finally {
    console.log = priorLog;
  }

  assert.equal(calls.discovered, 1);
  assert.equal(calls.resolved.length, 1);
  assert.equal(calls.resolved[0].modelName, "llama3.2:latest");
  assert.equal(calls.loaded.length, 1);
  assert.equal(calls.loaded[0].name, "ollama/llama3.2:latest");
  assert.equal(calls.loaded[0].options.modelPath, "/tmp/ollama/blobs/sha256-abc");
  assert.equal(calls.completions.length, 1);
  assert.equal(calls.completions[0].stream, false);
  assert.deepEqual(calls.completions[0].messages, [{ role: "user", content: "summarize this" }]);
  assert.deepEqual(logs, ["ollama-one-shot"]);
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

  assert.deepEqual(fetchCalls, ["http://127.0.0.1:11435/health/runtime"]);
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
      discoverOllamaLocalModels: async () => ([
        {
          id: "ollama/llama3.2:latest",
          name: "llama3.2:latest",
          size: 2_048_000_000,
          quant: "Q4_K_M"
        }
      ]),
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

test("pull command reports install success with deterministic spinner updates", async () => {
  const events = [];
  const cli = createCli({
    pull: {
      ensureModelInstalled: async (_model, { onProgress }) => {
        onProgress({ downloaded: 50, total: 100, speed: 25, eta: 2 });
        return { downloaded: true, metadata: { name: "llama-test", size: 100 } };
      },
      createSpinner: (text) => {
        const spinner = {
          text,
          succeed(message) {
            events.push({ kind: "succeed", message, text: spinner.text });
          },
          fail(message) {
            events.push({ kind: "fail", message, text: spinner.text });
          }
        };
        events.push({ kind: "start", text });
        return spinner;
      },
      formatBytes: (value) => `${value}B`,
      formatDuration: (value) => `${value}s`
    }
  });

  await cli.parseAsync(["node", "darksol", "pull", "llama-3.2-3b"]);

  assert.equal(events[0].kind, "start");
  assert.equal(events[0].text, "Pulling llama-3.2-3b");
  assert.equal(events[1].kind, "succeed");
  assert.equal(
    events[1].text,
    "Pulling llama-3.2-3b 50.0% 50B/100B 25B/s ETA 2s"
  );
  assert.match(events[1].message, /^Installed /);
  assert.match(events[1].message, /llama-test/);
});

test("pull command sets exit code on install failure", async () => {
  const events = [];
  let exitCode;
  const cli = createCli({
    pull: {
      ensureModelInstalled: async () => {
        throw new Error("network down");
      },
      createSpinner: (text) => {
        const spinner = {
          text,
          succeed() {},
          fail(message) {
            events.push(message);
          }
        };
        events.push(text);
        return spinner;
      },
      setExitCode: (value) => {
        exitCode = value;
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "pull", "llama-3.2-3b"]);

  assert.equal(exitCode, 1);
  assert.equal(events[0], "Pulling llama-3.2-3b");
  assert.equal(events[1], "Failed to pull llama-3.2-3b: network down");
});

test("rm command unloads removed model and logs success", async () => {
  const logs = [];
  const unloaded = [];
  const cli = createCli({
    rm: {
      removeModel: async (model) => {
        assert.equal(model, "llama-3.2-3b");
        return "llama-test";
      },
      modelPool: {
        unload: (name) => {
          unloaded.push(name);
        }
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "rm", "llama-3.2-3b"]);

  assert.deepEqual(unloaded, ["llama-test"]);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^Removed /);
  assert.match(logs[0], /llama-test/);
});

test("rm command logs failure and sets exit code", async () => {
  const errors = [];
  let exitCode;
  const cli = createCli({
    rm: {
      removeModel: async () => {
        throw new Error("not installed");
      },
      modelPool: { unload() {} },
      errorLog: (line) => {
        errors.push(line);
      },
      setExitCode: (value) => {
        exitCode = value;
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "rm", "missing-model"]);

  assert.equal(exitCode, 1);
  assert.deepEqual(errors, ["Failed to remove missing-model: not installed"]);
});

test("ps command prints empty state when no models are loaded", async () => {
  const logs = [];
  const cli = createCli({
    ps: {
      modelPool: {
        listLoaded() {
          return [];
        }
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "ps"]);

  assert.deepEqual(logs, ["No models loaded."]);
});

test("ps command renders loaded model table deterministically", async () => {
  const logs = [];
  const rows = [];
  const cli = createCli({
    ps: {
      modelPool: {
        listLoaded() {
          return [
            {
              name: "llama-test",
              size: 1024,
              quant: "Q4_K_M",
              gpuLayers: 24,
              threads: 8,
              lastUsed: "2026-03-08T00:00:00.000Z"
            }
          ];
        }
      },
      createTable: () => ({
        push(row) {
          rows.push(row);
        },
        toString() {
          return `rows=${rows.length}`;
        }
      }),
      formatBytes: (value) => `${value}B`,
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "ps"]);

  assert.deepEqual(rows, [["llama-test", "1024B", "Q4_K_M", 24, 8, "2026-03-08T00:00:00.000Z"]]);
  assert.deepEqual(logs, ["rows=1"]);
});

test("ps command prefers loaded models from running server runtime endpoint", async () => {
  const rows = [];
  const cli = createCli({
    ps: {
      loadConfig: async () => ({ host: "127.0.0.1", port: 11435 }),
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            loadedModels: [
              {
                name: "remote-loaded",
                size: 2048,
                quant: "Q4_K_M",
                gpuLayers: 32,
                threads: 10,
                lastUsed: "2026-03-08T00:00:00.000Z"
              }
            ]
          };
        }
      }),
      modelPool: {
        listLoaded() {
          return [];
        }
      },
      createTable: () => ({
        push(row) {
          rows.push(row);
        },
        toString() {
          return "rows=1";
        }
      }),
      formatBytes: (value) => `${value}B`,
      log() {}
    }
  });

  await cli.parseAsync(["node", "darksol", "ps"]);

  assert.deepEqual(rows, [["remote-loaded", "2048B", "Q4_K_M", 32, 10, "2026-03-08T00:00:00.000Z"]]);
});

test("browse command renders rows and supports deterministic --pull flow", async () => {
  const logs = [];
  const rows = [];
  const pulled = [];
  const cli = createCli({
    browse: {
      browseModels: async ({ category, sort, limit }) => {
        assert.equal(category, "chat");
        assert.equal(sort, "downloads");
        assert.equal(limit, 1);
        return [
          {
            id: "meta-llama/Llama-3.2-3B-Instruct-GGUF",
            downloads: 1234,
            updatedAt: "2026-03-01T00:00:00.000Z",
            tags: ["gguf", "text-generation", "chat", "llama"]
          }
        ];
      },
      ensureModelInstalled: async (id) => {
        pulled.push(id);
      },
      createTable: () => ({
        push(row) {
          rows.push(row);
        },
        toString() {
          return "browse-table";
        }
      }),
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync([
    "node",
    "darksol",
    "browse",
    "--category",
    "chat",
    "--sort",
    "downloads",
    "--limit",
    "1",
    "--pull",
    "1"
  ]);

  assert.deepEqual(rows, [[1, "meta-llama/Llama-3.2-3B-Instruct-GGUF", 1234, "2026-03-01", "gguf,text-generation,chat"]]);
  assert.deepEqual(pulled, ["meta-llama/Llama-3.2-3B-Instruct-GGUF"]);
  assert.deepEqual(logs, [
    "browse-table",
    "Pulling meta-llama/Llama-3.2-3B-Instruct-GGUF ...",
    "Installed meta-llama/Llama-3.2-3B-Instruct-GGUF"
  ]);
});

test("browse command sets exit code for invalid --pull index", async () => {
  const errors = [];
  let exitCode;
  const cli = createCli({
    browse: {
      browseModels: async () => ([{ id: "model-1", downloads: 1, updatedAt: null, tags: [] }]),
      createTable: () => ({
        push() {},
        toString() {
          return "browse-table";
        }
      }),
      log() {},
      errorLog: (line) => {
        errors.push(line);
      },
      setExitCode: (value) => {
        exitCode = value;
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "browse", "--pull", "2"]);

  assert.equal(exitCode, 1);
  assert.deepEqual(errors, ["Invalid pull index."]);
});

test("run command fails for ollama/<model> when local manifest model is missing", async () => {
  const cli = createCli({
    run: {
      discoverOllamaLocalModels: async () => ([]),
      resolveOllamaLocalModel: async () => null
    }
  });

  await assert.rejects(
    cli.parseAsync(["node", "darksol", "run", "ollama/llama3.2:latest", "hello"]),
    /not found locally/
  );
});

test("run command fails for ollama/<model> when discovery returns no matching model", async () => {
  const cli = createCli({
    run: {
      discoverOllamaLocalModels: async () => ([]),
      resolveOllamaLocalModel: async () => null
    }
  });

  await assert.rejects(
    cli.parseAsync(["node", "darksol", "run", "ollama/llama3.2:latest", "hello"]),
    /not found locally/
  );
});

test("run command fails for invalid local model", async () => {
  const cli = createCli({
    run: {
      loadConfig: async () => ({ ollamaEnabled: true, ollamaBaseUrl: "http://127.0.0.1:11434" }),
      ensureModelInstalled: async () => {
        throw new Error("Model not installed: bankr/ghost-model");
      }
    }
  });

  await assert.rejects(
    cli.parseAsync(["node", "darksol", "run", "bankr/ghost-model", "hello"]),
    /Model not installed/
  );
});

test("list command tolerates offline Ollama provider and prints local models only", async () => {
  const logs = [];
  const cli = createCli({
    list: {
      loadConfig: async () => ({ ollamaEnabled: true, ollamaBaseUrl: "http://127.0.0.1:11434" }),
      discoverOllamaLocalModels: async () => {
        throw new Error("read EACCES");
      },
      listInstalledModels: async () => ([
        {
          name: "llama-test",
          size: 1_024_000_000,
          quant: "Q4_K_M",
          repo: "meta-llama/Llama-3.2-3B-Instruct"
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
  assert.doesNotMatch(logs[0], /ollama\//);
});

test("status command reports offline server when health endpoint is unreachable", async () => {
  const logs = [];
  const cli = createCli({
    status: {
      loadConfig: async () => ({ host: "127.0.0.1", port: 11435 }),
      detectHardware: async () => ({
        cpu: { brand: "Test CPU", physicalCores: 8 },
        memory: { free: 8 * 1024 ** 3, total: 16 * 1024 ** 3 },
        gpus: []
      }),
      getThermalStatus: async () => ({ main: null }),
      modelPool: {
        listLoaded() {
          return [];
        }
      },
      fetchImpl: async () => {
        throw new Error("offline");
      },
      log: (line) => {
        logs.push(line);
      }
    }
  });

  await cli.parseAsync(["node", "darksol", "status"]);

  assert.ok(logs.some((line) => line.includes("Server: offline")));
});
