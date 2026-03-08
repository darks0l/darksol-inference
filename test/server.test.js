import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "../src/server/index.js";

let server;
let baseUrl;

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

before(async () => {
  server = await startServer({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

test("GET /health returns service health", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "darksol-inference");
});

test("GET /v1/models returns OpenAI-style model list", async () => {
  const response = await fetch(`${baseUrl}/v1/models`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.object, "list");
  assert.ok(Array.isArray(body.data));
});

test("POST /v1/chat/completions returns 400 when model is missing", async () => {
  const { response, payload } = await postJson("/v1/chat/completions", {
      messages: [{ role: "user", content: "hi" }]
  });

  assert.equal(response.status, 400);
  assert.ok(payload.error?.message);
  assert.equal(payload.error.type, "invalid_request_error");
  assert.equal(payload.error.code, "model_required");
});

test("POST /v1/chat/completions returns error for unknown model", async () => {
  const { response, payload } = await postJson("/v1/chat/completions", {
      model: "unknown-model",
      messages: [{ role: "user", content: "hello" }]
  });

  assert.equal(response.status, 404);
  assert.ok(payload.error?.message);
  assert.equal(payload.error.type, "invalid_request_error");
  assert.equal(payload.error.code, "model_not_found");
});
