import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { downloadModel, ModelPullError } from "../src/models/pull.js";

function createMemoryFs({ freeBytes = 10 * 1024 * 1024 * 1024 } = {}) {
  const files = new Map();

  return {
    files,
    fsApi: {
      createWriteStream(filePath) {
        const chunks = [];
        return new Writable({
          write(chunk, _enc, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
          },
          final(callback) {
            files.set(filePath, Buffer.concat(chunks));
            callback();
          }
        });
      }
    },
    fsPromisesApi: {
      async mkdir() {},
      async statfs() {
        return { bsize: 4096, bavail: Math.floor(freeBytes / 4096) };
      },
      async rename(fromPath, toPath) {
        const value = files.get(fromPath);
        files.delete(fromPath);
        files.set(toPath, value);
      },
      async rm(filePath) {
        files.delete(filePath);
      },
      async writeFile(filePath, content) {
        files.set(filePath, Buffer.from(String(content)));
      }
    }
  };
}

test("downloadModel streams GGUF from HuggingFace and writes metadata", async () => {
  const fsDeps = createMemoryFs();
  const progress = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes("/api/models/")) {
      return {
        ok: true,
        async json() {
          return {
            pipeline_tag: "text-generation",
            siblings: [
              { rfilename: "model.Q4_K_M.gguf" },
              { rfilename: "model.Q8_0.gguf" }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "6" }),
      body: [Buffer.from("abc"), Buffer.from("def")]
    };
  };

  const metadata = await downloadModel(
    {
      spec: {
        localName: "unit-test-model",
        requested: "owner/repo/Q4_K_M",
        alias: null,
        repo: "owner/repo",
        fileHint: "Q4_K_M"
      },
      onProgress: (state) => progress.push(state)
    },
    {
      fetchImpl,
      fsApi: fsDeps.fsApi,
      fsPromisesApi: fsDeps.fsPromisesApi,
      readFromWeb: (body) => Readable.from(body)
    }
  );

  assert.equal(metadata.file, "model.Q4_K_M.gguf");
  assert.equal(metadata.size, 6);
  assert.equal(metadata.quant, "Q4_K");
  assert.equal(metadata.family, "text-generation");
  assert.ok(progress.length >= 2);
  assert.equal(progress.at(-1).downloaded, 6);

  const storedModel = [...fsDeps.files.entries()].find(([filePath]) =>
    /unit-test-model[\\/]+model\.gguf$/i.test(filePath)
  );
  assert.ok(storedModel);
  assert.equal(storedModel[1].toString("utf8"), "abcdef");

  const storedMetadata = [...fsDeps.files.entries()].find(([filePath]) =>
    /unit-test-model[\\/]+metadata\.json$/i.test(filePath)
  );
  assert.ok(storedMetadata);
  assert.match(storedMetadata[1].toString("utf8"), /"name": "unit-test-model"/);
});

test("downloadModel maps HuggingFace metadata 404 to model_not_found", async () => {
  const fsDeps = createMemoryFs();
  const fetchImpl = async () => ({ ok: false, status: 404 });

  await assert.rejects(
    downloadModel(
      {
        spec: {
          localName: "missing-model",
          requested: "owner/missing",
          alias: null,
          repo: "owner/missing",
          fileHint: null
        }
      },
      {
        fetchImpl,
        fsApi: fsDeps.fsApi,
        fsPromisesApi: fsDeps.fsPromisesApi,
        readFromWeb: (body) => Readable.from(body)
      }
    ),
    (error) => {
      assert.ok(error instanceof ModelPullError);
      assert.equal(error.code, "model_not_found");
      assert.equal(error.status, 404);
      return true;
    }
  );
});

test("downloadModel fails gracefully on insufficient disk space", async () => {
  const fsDeps = createMemoryFs({ freeBytes: 1024 });
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes("/api/models/")) {
      return {
        ok: true,
        async json() {
          return { siblings: [{ rfilename: "model.gguf" }] };
        }
      };
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "100000" }),
      body: [Buffer.from("payload")]
    };
  };

  await assert.rejects(
    downloadModel(
      {
        spec: {
          localName: "large-model",
          requested: "owner/repo",
          alias: null,
          repo: "owner/repo",
          fileHint: null
        }
      },
      {
        fetchImpl,
        fsApi: fsDeps.fsApi,
        fsPromisesApi: fsDeps.fsPromisesApi,
        readFromWeb: (body) => Readable.from(body)
      }
    ),
    (error) => {
      assert.ok(error instanceof ModelPullError);
      assert.equal(error.code, "insufficient_storage");
      return true;
    }
  );
});
