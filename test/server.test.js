import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildServer, startServer } from "../src/server/index.js";

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

async function withTempServer(options, fn) {
  const tempServer = await buildServer(options);
  await tempServer.listen({ host: "127.0.0.1", port: 0 });
  const address = tempServer.server.address();
  const tempBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(tempBaseUrl);
  } finally {
    await tempServer.close();
  }
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

test("GET /v1/directory/models returns normalized model directory items", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return [
        {
          id: "sentence-transformers/all-MiniLM-L6-v2",
          downloads: 1000,
          likes: 50,
          pipeline_tag: "feature-extraction",
          library_name: "sentence-transformers",
          lastModified: "2025-01-01T00:00:00.000Z"
        }
      ];
    }
  });

  await withTempServer({ fetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(
      `${tempBaseUrl}/v1/directory/models?q=minilm&limit=1&task=feature-extraction`
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.object, "list");
    assert.deepEqual(body.items, [
      {
        id: "sentence-transformers/all-MiniLM-L6-v2",
        downloads: 1000,
        likes: 50,
        pipeline_tag: "feature-extraction",
        library_name: "sentence-transformers",
        lastModified: "2025-01-01T00:00:00.000Z"
      }
    ]);
  });
});

test("GET /v1/directory/models returns OpenAI-style error when upstream fails", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };

  await withTempServer({ fetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/directory/models?q=llama`);
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.type, "api_error");
    assert.equal(body.error.code, "upstream_unreachable");
    assert.ok(body.error.message);
  });
});

test("GET /v1/bankr/health returns non-secret gateway config status", async () => {
  const priorEnv = {
    BANKR_BASE_URL: process.env.BANKR_BASE_URL,
    BANKR_API_KEY: process.env.BANKR_API_KEY,
    BANKR_SANDBOX: process.env.BANKR_SANDBOX
  };

  process.env.BANKR_BASE_URL = "https://api.bankr.local";
  process.env.BANKR_API_KEY = "secret-key-value";
  process.env.BANKR_SANDBOX = "true";

  try {
    const response = await fetch(`${baseUrl}/v1/bankr/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.provider, "bankr");
    assert.equal(body.configured, true);
    assert.equal(body.baseUrlConfigured, true);
    assert.equal(body.sandbox, true);
    assert.equal(body.apiKey, undefined);
  } finally {
    if (priorEnv.BANKR_BASE_URL === undefined) {
      delete process.env.BANKR_BASE_URL;
    } else {
      process.env.BANKR_BASE_URL = priorEnv.BANKR_BASE_URL;
    }

    if (priorEnv.BANKR_API_KEY === undefined) {
      delete process.env.BANKR_API_KEY;
    } else {
      process.env.BANKR_API_KEY = priorEnv.BANKR_API_KEY;
    }

    if (priorEnv.BANKR_SANDBOX === undefined) {
      delete process.env.BANKR_SANDBOX;
    } else {
      process.env.BANKR_SANDBOX = priorEnv.BANKR_SANDBOX;
    }
  }
});
