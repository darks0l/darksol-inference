import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildServer, startServer } from "../src/server/index.js";

let server;
let baseUrl;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createJsonLineStream(items) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const item of items) {
        controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
      }
      controller.close();
    }
  });
}

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

test("GET /health/runtime returns runtime health with loaded model inventory", async () => {
  const response = await fetch(`${baseUrl}/health/runtime`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "darksol-inference");
  assert.ok(Array.isArray(body.loadedModels));
  assert.ok(body.hardware?.cpu?.brand);
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
  assert.equal(body.branding.banner, "/assets/darksol-banner.png");
  assert.equal(body.branding.manifest, "/assets/icons/site.webmanifest");
  assert.equal(body.web.shell, "/web/index.html");
  assert.equal(body.web.layout, "desktop-mirror-three-panel");
  assert.equal(body.desktop.entrypoint, "desktop/src/main.js");
  assert.equal(body.desktop.packaging.windows, "desktop/config/packaging.win.json");
  assert.equal(body.desktop.packaging.macos, "desktop/config/packaging.mac.json");
});

test("GET /web/index.html serves static shell HTML", async () => {
  const response = await fetch(`${baseUrl}/web/index.html`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/i);
  assert.match(body, /DARKSOL Inference Workspace/);
  assert.match(body, /Desktop-Mirror Web Shell/);
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

test("POST /v1/completions falls back to ollama for unprefixed missing local models", async () => {
  const ollamaFetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/generate")) {
      const body = JSON.parse(init.body);
      assert.equal(body.model, "llama3.2:latest");
      assert.equal(body.prompt, "hello");
      return {
        ok: true,
        async json() {
          return { response: "fallback completion" };
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
        model: "llama3.2:latest",
        prompt: "hello"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.model, "ollama/llama3.2:latest");
    assert.equal(body.choices?.[0]?.text, "fallback completion");
  });
});

test("POST /v1/chat/completions falls back to ollama for unprefixed missing local models", async () => {
  const ollamaFetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/chat")) {
      const body = JSON.parse(init.body);
      assert.equal(body.model, "llama3.2:latest");
      assert.equal(body.messages?.[0]?.content, "hello");
      return {
        ok: true,
        async json() {
          return { message: { content: "fallback chat" } };
        }
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:latest",
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.model, "ollama/llama3.2:latest");
    assert.equal(body.choices?.[0]?.message?.content, "fallback chat");
  });
});

test("POST /v1/chat/completions streams SSE chunks for Ollama chat", async () => {
  const ollamaFetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/chat")) {
      const body = JSON.parse(init.body);
      assert.equal(body.stream, true);
      return {
        ok: true,
        body: createJsonLineStream([
          { message: { content: "Hello" } },
          { message: { content: " world" } }
        ])
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ollama/llama3.2:latest",
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      })
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/event-stream\b/i);
    assert.match(body, /"object":"chat\.completion\.chunk"/);
    assert.match(body, /"content":"Hello"/);
    assert.match(body, /"content":" world"/);
    assert.match(body, /\[DONE]/);
  });
});

test("POST /v1/completions streams SSE chunks for Ollama completion", async () => {
  const ollamaFetchImpl = async (url, init) => {
    if (String(url).endsWith("/api/generate")) {
      const body = JSON.parse(init.body);
      assert.equal(body.stream, true);
      return {
        ok: true,
        body: createJsonLineStream([
          { response: "alpha" },
          { response: " beta" }
        ])
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
        stream: true,
        prompt: "hello"
      })
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/event-stream\b/i);
    assert.match(body, /"object":"text_completion"/);
    assert.match(body, /"text":"alpha"/);
    assert.match(body, /"text":" beta"/);
    assert.match(body, /\[DONE]/);
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

test("Inference queue serializes /v1/completions and /v1/chat/completions with concurrency=1", async () => {
  const firstStarted = createDeferred();
  const secondStarted = createDeferred();
  const releaseFirst = createDeferred();
  const releaseSecond = createDeferred();
  let sawSecondStart = false;

  const ollamaFetchImpl = async (url) => {
    const pathname = new URL(String(url)).pathname;

    if (pathname === "/api/generate") {
      firstStarted.resolve();
      await releaseFirst.promise;
      return {
        ok: true,
        async json() {
          return { response: "first done" };
        }
      };
    }

    if (pathname === "/api/chat") {
      sawSecondStart = true;
      secondStarted.resolve();
      await releaseSecond.promise;
      return {
        ok: true,
        async json() {
          return { message: { content: "second done" } };
        }
      };
    }

    throw new Error(`unexpected url: ${url}`);
  };

  await withTempServer(
    { ollamaEnabled: true, ollamaFetchImpl, inferenceConcurrency: 1 },
    async (tempBaseUrl) => {
      const firstRequest = fetch(`${tempBaseUrl}/v1/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "ollama/llama3.2:latest",
          prompt: "first"
        })
      });

      await firstStarted.promise;

      const secondRequest = fetch(`${tempBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "ollama/llama3.2:latest",
          messages: [{ role: "user", content: "second" }]
        })
      });

      await Promise.resolve();
      await Promise.resolve();
      assert.equal(sawSecondStart, false);

      releaseFirst.resolve();

      const firstResponse = await firstRequest;
      const firstBody = await firstResponse.json();
      assert.equal(firstResponse.status, 200);
      assert.equal(firstBody.choices?.[0]?.text, "first done");

      await secondStarted.promise;
      releaseSecond.resolve();

      const secondResponse = await secondRequest;
      const secondBody = await secondResponse.json();
      assert.equal(secondResponse.status, 200);
      assert.equal(secondBody.choices?.[0]?.message?.content, "second done");
    }
  );
});

test("POST /v1/completions retries once on transient provider errors", async () => {
  let attempts = 0;

  const ollamaFetchImpl = async (url) => {
    if (!String(url).endsWith("/api/generate")) {
      throw new Error(`unexpected url: ${url}`);
    }

    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 502,
        async json() {
          return { error: "upstream temporarily unavailable" };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return { response: "retried completion" };
      }
    };
  };

  await withTempServer({ ollamaEnabled: true, ollamaFetchImpl }, async (tempBaseUrl) => {
    const response = await fetch(`${tempBaseUrl}/v1/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "ollama/llama3.2:latest",
        prompt: "retry me"
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.choices?.[0]?.text, "retried completion");
    assert.equal(attempts, 2);
  });
});

test("POST /v1/completions returns provider_timeout after timeout with single retry", async () => {
  let attempts = 0;

  const ollamaFetchImpl = async (url) => {
    if (!String(url).endsWith("/api/generate")) {
      throw new Error(`unexpected url: ${url}`);
    }
    attempts += 1;
    return new Promise(() => {});
  };

  const immediateTimers = {
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {}
  };

  await withTempServer(
    { ollamaEnabled: true, ollamaFetchImpl, providerTimeoutMs: 1000, timers: immediateTimers },
    async (tempBaseUrl) => {
      const response = await fetch(`${tempBaseUrl}/v1/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "ollama/llama3.2:latest",
          prompt: "will timeout"
        })
      });
      const body = await response.json();

      assert.equal(response.status, 504);
      assert.equal(body.error.type, "api_error");
      assert.equal(body.error.code, "provider_timeout");
      assert.equal(attempts, 2);
    }
  );
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
