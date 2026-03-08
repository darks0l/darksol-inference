import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  discoverOllamaLocalModels,
  resolveOllamaLocalGgufPath,
  resolveOllamaModelsRoot
} from "../src/providers/ollama-local.js";

function createDirent(name, kind) {
  return {
    name,
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file"
  };
}

function createMockFs(files, { now = new Date("2026-03-08T00:00:00.000Z") } = {}) {
  const fileMap = new Map(Object.entries(files));
  const dirs = new Set(["/"]);

  for (const filePath of fileMap.keys()) {
    const segments = filePath.split("/").filter(Boolean);
    let current = "";
    for (let idx = 0; idx < segments.length - 1; idx += 1) {
      current += `/${segments[idx]}`;
      dirs.add(current);
    }
  }

  return {
    async readdir(dirPath, options = {}) {
      if (!dirs.has(dirPath)) {
        throw new Error(`ENOENT: ${dirPath}`);
      }

      const childKinds = new Map();
      const prefix = dirPath === "/" ? "/" : `${dirPath}/`;

      for (const directoryPath of dirs) {
        if (!directoryPath.startsWith(prefix) || directoryPath === dirPath) {
          continue;
        }
        const remainder = directoryPath.slice(prefix.length);
        if (remainder && !remainder.includes("/")) {
          childKinds.set(remainder, "dir");
        }
      }

      for (const filePath of fileMap.keys()) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const remainder = filePath.slice(prefix.length);
        if (remainder && !remainder.includes("/")) {
          childKinds.set(remainder, "file");
        }
      }

      if (options.withFileTypes) {
        return [...childKinds.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, kind]) => createDirent(name, kind));
      }

      return [...childKinds.keys()].sort((a, b) => a.localeCompare(b));
    },

    async readFile(filePath) {
      if (!fileMap.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return fileMap.get(filePath);
    },

    async access(filePath) {
      if (!fileMap.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
    },

    async stat(filePath) {
      if (!fileMap.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return { mtime: now };
    }
  };
}

test("resolveOllamaModelsRoot resolves expected platform paths", () => {
  const winRoot = resolveOllamaModelsRoot({
    platform: "win32",
    env: { USERPROFILE: "C:\\Users\\alice" },
    homedir: "C:\\Users\\alice",
    pathImpl: path.win32
  });
  const macRoot = resolveOllamaModelsRoot({
    platform: "darwin",
    homedir: "/Users/alice",
    pathImpl: path.posix
  });
  const linuxRoot = resolveOllamaModelsRoot({
    platform: "linux",
    homedir: "/home/alice",
    pathImpl: path.posix
  });

  assert.equal(winRoot, "C:\\Users\\alice\\.ollama\\models");
  assert.equal(macRoot, "/Users/alice/.ollama/models");
  assert.equal(linuxRoot, "/home/alice/.ollama/models");
});

test("discoverOllamaLocalModels parses manifests and resolves GGUF blob paths", async () => {
  const modelsRoot = "/home/test/.ollama/models";
  const fsImpl = createMockFs({
    "/home/test/.ollama/models/manifests/registry.ollama.ai/library/llama3.2/latest": JSON.stringify({
      schemaVersion: 2,
      config: { digest: "sha256:cfgllama" },
      layers: [
        { mediaType: "application/vnd.ollama.image.model", digest: "sha256:modelllama", size: 111 },
        { mediaType: "application/vnd.ollama.image.template", digest: "sha256:tmpl", size: 11 }
      ]
    }),
    "/home/test/.ollama/models/manifests/registry.ollama.ai/acme/coder/v1": JSON.stringify({
      schemaVersion: 2,
      config: { digest: "sha256:cfgcoder" },
      layers: [
        { mediaType: "application/vnd.ollama.image.model", digest: "sha256:modelcoder", size: 222 }
      ]
    }),
    "/home/test/.ollama/models/manifests/registry.ollama.ai/library/missing/latest": JSON.stringify({
      schemaVersion: 2,
      layers: [{ mediaType: "application/vnd.ollama.image.model", digest: "sha256:missingblob", size: 333 }]
    }),
    "/home/test/.ollama/models/blobs/sha256-cfgllama": JSON.stringify({
      model_format: "gguf",
      model_family: "llama",
      model_type: "3B",
      file_type: "Q4_K_M"
    }),
    "/home/test/.ollama/models/blobs/sha256-cfgcoder": JSON.stringify({
      model_format: "gguf",
      model_family: "qwen",
      model_type: "7B",
      file_type: "Q8_0"
    }),
    "/home/test/.ollama/models/blobs/sha256-modelllama": "GGUF",
    "/home/test/.ollama/models/blobs/sha256-modelcoder": "GGUF"
  });

  const models = await discoverOllamaLocalModels({ fsImpl, pathImpl: path.posix, modelsRoot });

  assert.deepEqual(
    models.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      quant: item.quant,
      family: item.family,
      parameterSize: item.parameterSize,
      ggufPath: item.ggufPath
    })),
    [
      {
        id: "ollama/acme/coder:v1",
        name: "acme/coder:v1",
        size: 222,
        quant: "Q8_0",
        family: "qwen",
        parameterSize: "7B",
        ggufPath: "/home/test/.ollama/models/blobs/sha256-modelcoder"
      },
      {
        id: "ollama/llama3.2:latest",
        name: "llama3.2:latest",
        size: 111,
        quant: "Q4_K_M",
        family: "llama",
        parameterSize: "3B",
        ggufPath: "/home/test/.ollama/models/blobs/sha256-modelllama"
      }
    ]
  );
});

test("resolveOllamaLocalGgufPath resolves prefixed/unprefixed names and defaults :latest", async () => {
  const models = [
    { name: "llama3.2:latest", ggufPath: "/models/sha256-llama" },
    { name: "acme/coder:v1", ggufPath: "/models/sha256-coder" }
  ];

  assert.equal(await resolveOllamaLocalGgufPath("ollama/llama3.2", { models }), "/models/sha256-llama");
  assert.equal(await resolveOllamaLocalGgufPath("acme/coder:v1", { models }), "/models/sha256-coder");
  assert.equal(await resolveOllamaLocalGgufPath("missing", { models }), null);
});
