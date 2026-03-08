import assert from "node:assert/strict";
import test from "node:test";
import { createEmbedding } from "../src/engine/embeddings.js";

test("createEmbedding uses model embedding context and returns vector", async () => {
  const calls = [];
  const model = {
    async createEmbeddingContext() {
      calls.push("createEmbeddingContext");
      return {
        async getEmbeddingFor(input) {
          calls.push(input);
          return { vector: [0.1, 0.2, 0.3] };
        }
      };
    }
  };

  const vector = await createEmbedding({ model, input: "hello" });
  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.deepEqual(calls, ["createEmbeddingContext", "hello"]);
});
