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
  server = await startServer({ host: "127.0.0.1", port: 0, ollamaEnabled: false });
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

test("GET /v1/models includes Ollama local inventory when enabled", async () => {
  const ollamaFetchImpl = async (url) => {
    if (String(url).endsWith("/api/tags")) {
      return {
        ok: true,
        async json() {
          return {
            models: [
              {
                name: "llama3.2:latest",
                size: 123456789,
                modified_at: "2026-03-01T00:00:00.000Z",
                details: { quantization_level: "Q4_K_M", family: "llama", parameter_size: "3B" }
              }
            ]
          };
        }
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/models`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(body.data.some((item) => item.id === "ollama/llama3.2:latest" && item.provider === "ollama"));
  });
});

test("GET /v1/ollama/models returns discovered local Ollama models", async () => {
  const ollamaFetchImpl = async (url) => {
    if (String(url).endsWith("/api/tags")) {
      return {
        ok: true,
        async json() {
          return {
            models: [
              {
                name: "qwen2.5:7b",
                size: 22334455,
                modified_at: "2026-03-02T00:00:00.000Z",
                details: { quantization_level: "Q8_0", family: "qwen", parameter_size: "7B" }
              }
            ]
          };
        }
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/ollama/models`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.object, "list");
    assert.deepEqual(body.data, [
      {
        id: "ollama/qwen2.5:7b",
        object: "model",
        owned_by: "ollama",
        provider: "ollama",
        created: Math.floor(new Date("2026-03-02T00:00:00.000Z").getTime() / 1000),
        size: 22334455,
        quant: "Q8_0",
        family: "qwen",
        parameter_size: "7B"
      }
    ]);
  });
});

test("GET /v1/app/meta returns app bootstrap metadata", async () => {
  const response = await fetch(`${baseUrl}/v1/app/meta`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.app.name, "DARKSOL Inference");
  assert.equal(body.app.packageName, "darksol");
  assert.ok(typeof body.app.version === "string");
  assert.ok(Array.isArray(body.routes));
  assert.ok(body.routes.some((route) => route.method === "GET" && route.path === "/v1/app/meta"));
  assert.equal(body.branding.logo, "/assets/footer-logo-darksol.png");
  assert.equal(body.branding.manifest, "/assets/icons/site.webmanifest");
  assert.equal(body.web.shell, "/web/index.html");
});

test("GET /web/index.html serves static shell HTML", async () => {
  const response = await fetch(`${baseUrl}/web/index.html`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
  assert.match(body, /DARKSOL Dashboard/);
});

test("GET /assets/icons/favicon-32x32.png serves static icon PNG", async () => {
  const response = await fetch(`${baseUrl}/assets/icons/favicon-32x32.png`);
  const body = await response.arrayBuffer();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^image\/png\b/i);
  assert.ok(body.byteLength > 0);
});

test("Static routes reject non-loopback clients", async () => {
  const tempServer = await buildServer();

  try {
    const response = await tempServer.inject({
      method: "GET",
      url: "/web/index.html",
      remoteAddress: "203.0.113.10"
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await tempServer.close();
  }
});

test("API key middleware enforces /v1/* and keeps /health public", async () => {
  await withTempServer({ apiKey: "topsecret" }, async (tempBaseUrl) => {
    const missingKeyResponse = await fetch(`${tempBaseUrl}/v1/models`);
    const missingKeyBody = await missingKeyResponse.json();
    assert.equal(missingKeyResponse.status, 401);
    assert.equal(missingKeyBody.error?.message, "Missing bearer token");

    const invalidKeyResponse = await fetch(`${tempBaseUrl}/v1/models`, {
      headers: { authorization: "Bearer wrong" }
    });
    const invalidKeyBody = await invalidKeyResponse.json();
    assert.equal(invalidKeyResponse.status, 401);
    assert.equal(invalidKeyBody.error?.message, "Invalid API key");

    const healthResponse = await fetch(`${tempBaseUrl}/health`);
    const healthBody = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(healthBody.status, "ok");
  });
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

test("POST /v1/completions can run against ollama/<model> path", async () => {
  const ollamaFetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/generate")) {
      const body = JSON.parse(init.body);
      assert.equal(body.model, "llama3.2:latest");
      assert.equal(body.prompt, "hello");
      return {
        ok: true,
        async json() {
          return { response: "hello from ollama" };
        }
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ollama/llama3.2:latest",
        prompt: "hello"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.model, "ollama/llama3.2:latest");
    assert.equal(body.choices?.[0]?.text, "hello from ollama");
  });
});

test("POST /v1/completions returns model_not_found for missing Ollama model", async () => {
  const ollamaFetchImpl = async (url) => {
    if (String(url).endsWith("/api/generate")) {
      return {
        ok: false,
        status: 404,
        async json() {
          return { error: "model 'missing' not found" };
        }
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ollama/missing",
        prompt: "hello"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.type, "invalid_request_error");
    assert.equal(body.error.code, "model_not_found");
  });
});

test("GET /v1/ollama/models returns upstream_unreachable style error when Ollama is offline", async () => {
  const ollamaFetchImpl = async () => {
    throw new Error("connect ECONNREFUSED");
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/ollama/models`);
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error.type, "api_error");
    assert.equal(body.error.code, "ollama_unreachable");
  });
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
