const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 4000;

function mergeAbortSignals(externalSignal, timeoutSignal) {
  if (!externalSignal) {
    return timeoutSignal;
  }

  if (externalSignal.aborted || timeoutSignal.aborted) {
    return AbortSignal.abort();
  }

  const merged = new AbortController();
  const abortMerged = () => merged.abort();
  externalSignal.addEventListener("abort", abortMerged, { once: true });
  timeoutSignal.addEventListener("abort", abortMerged, { once: true });
  return merged.signal;
}

export class OllamaError extends Error {
  constructor(message, { status = 500, code = "ollama_error", cause } = {}) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

export function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function resolveOllamaSettings({ baseUrl, enabled } = {}) {
  const envBaseUrl = process.env.DARKSOL_OLLAMA_BASE_URL || process.env.OLLAMA_HOST;
  const envEnabled = process.env.DARKSOL_OLLAMA_ENABLED;

  return {
    baseUrl: (baseUrl || envBaseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, ""),
    enabled: typeof enabled === "boolean" ? enabled : parseBooleanEnv(envEnabled, true)
  };
}

export function isOllamaModelId(modelId = "") {
  return String(modelId).startsWith("ollama/");
}

export function toOllamaModelName(modelId) {
  return String(modelId).replace(/^ollama\//, "");
}

export function toOllamaModelId(modelName) {
  return `ollama/${modelName}`;
}

export function createOllamaClient(options = {}) {
  const settings = resolveOllamaSettings(options);
  return new OllamaClient({ ...options, ...settings });
}

export class OllamaClient {
  constructor({ baseUrl, enabled = true, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = (baseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
    this.enabled = enabled;
    this.fetchImpl = fetchImpl || fetch;
    this.timeoutMs = timeoutMs;
  }

  async listLocalModels() {
    const payload = await this.#requestJson("/api/tags", { method: "GET" });
    const models = Array.isArray(payload?.models) ? payload.models : [];

    return models.map((model) => ({
      name: model.name,
      id: toOllamaModelId(model.name),
      size: model.size || 0,
      quant: model.details?.quantization_level || null,
      modifiedAt: model.modified_at || null,
      family: model.details?.family || null,
      parameterSize: model.details?.parameter_size || null
    }));
  }

  async generate({ model, prompt, stream = false, options, onTextChunk, signal }) {
    const requestBody = {
      model,
      prompt,
      stream,
      options
    };

    if (stream) {
      return this.#streamJsonLines("/api/generate", requestBody, (item) => {
        const chunk = item?.response || "";
        if (chunk && onTextChunk) {
          onTextChunk(chunk);
        }
        return chunk;
      }, signal);
    }

    const payload = await this.#requestJson("/api/generate", {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: { "content-type": "application/json" },
      signal
    });
    return payload?.response || "";
  }

  async chat({ model, messages, stream = false, options, onTextChunk, signal }) {
    const requestBody = {
      model,
      messages,
      stream,
      options
    };

    if (stream) {
      return this.#streamJsonLines("/api/chat", requestBody, (item) => {
        const chunk = item?.message?.content || "";
        if (chunk && onTextChunk) {
          onTextChunk(chunk);
        }
        return chunk;
      }, signal);
    }

    const payload = await this.#requestJson("/api/chat", {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers: { "content-type": "application/json" },
      signal
    });

    return payload?.message?.content || "";
  }

  async #requestJson(path, init = {}) {
    if (!this.enabled) {
      throw new OllamaError("Ollama provider is disabled.", { status: 400, code: "ollama_disabled" });
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = mergeAbortSignals(init.signal, timeoutController.signal);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal
      });

      if (!response.ok) {
        throw await this.#toOllamaError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }

      if (error?.name === "AbortError") {
        throw new OllamaError("Timed out while connecting to Ollama.", {
          status: 502,
          code: "ollama_unreachable",
          cause: error
        });
      }

      throw new OllamaError("Failed to connect to Ollama.", {
        status: 502,
        code: "ollama_unreachable",
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async #streamJsonLines(path, requestBody, onObjectChunk, externalSignal) {
    if (!this.enabled) {
      throw new OllamaError("Ollama provider is disabled.", { status: 400, code: "ollama_disabled" });
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const signal = mergeAbortSignals(externalSignal, timeoutController.signal);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        throw await this.#toOllamaError(response);
      }

      if (!response.body) {
        return "";
      }

      const decoder = new TextDecoder();
      let buffered = "";
      let complete = "";

      for await (const chunk of response.body) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const item = JSON.parse(line);
          complete += onObjectChunk(item);
        }
      }

      if (buffered.trim()) {
        const item = JSON.parse(buffered);
        complete += onObjectChunk(item);
      }

      return complete;
    } catch (error) {
      if (error instanceof OllamaError) {
        throw error;
      }

      if (error?.name === "AbortError") {
        throw new OllamaError("Timed out while connecting to Ollama.", {
          status: 502,
          code: "ollama_unreachable",
          cause: error
        });
      }

      throw new OllamaError("Failed to stream from Ollama.", {
        status: 502,
        code: "ollama_unreachable",
        cause: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async #toOllamaError(response) {
    let message = `Ollama request failed (${response.status})`;
    let code = "ollama_error";

    try {
      const payload = await response.json();
      if (typeof payload?.error === "string" && payload.error) {
        message = payload.error;
      }
    } catch {
      // no-op
    }

    if (response.status === 404 || message.toLowerCase().includes("not found")) {
      code = "model_not_found";
    } else if (response.status >= 500) {
      code = "ollama_upstream_error";
    }

    return new OllamaError(message, { status: response.status, code });
  }
}
