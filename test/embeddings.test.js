import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerEmbeddingsRoutes } from "../src/server/routes/embeddings.js";

test("POST /v1/embeddings generates vectors for string and string-array inputs", async () => {
  const requests = [];
  const app = Fastify({ logger: false });

  await registerEmbeddingsRoutes(app, {
    modelPool: {
      async load(name) {
        assert.equal(name, "embed-test");
        return { model: { id: "embedding-model" } };
      }
    },
    createEmbedding: async ({ model, input }) => {
      assert.equal(model.id, "embedding-model");
      requests.push(input);
      return [input.length, input.length + 1];
    }
  });

  const single = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    payload: { model: "embed-test", input: "abc" }
  });
  const singleBody = single.json();

  assert.equal(single.statusCode, 200);
  assert.deepEqual(requests, ["abc"]);
  assert.deepEqual(singleBody.data, [{ object: "embedding", embedding: [3, 4], index: 0 }]);

  const multi = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    payload: { model: "embed-test", input: ["hi", "hello"] }
  });
  const multiBody = multi.json();

  assert.equal(multi.statusCode, 200);
  assert.deepEqual(requests, ["abc", "hi", "hello"]);
  assert.deepEqual(multiBody.data, [
    { object: "embedding", embedding: [2, 3], index: 0 },
    { object: "embedding", embedding: [5, 6], index: 1 }
  ]);

  await app.close();
});

test("POST /v1/embeddings rejects invalid inputs", async () => {
  const app = Fastify({ logger: false });
  await registerEmbeddingsRoutes(app, {
    modelPool: {
      async load() {
        return { model: {} };
      }
    },
    createEmbedding: async () => [0]
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    payload: { model: "embed-test", input: 123 }
  });
  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(body.error?.code, "invalid_input");

  await app.close();
});
