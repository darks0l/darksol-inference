const DEFAULT_CONCURRENCY = 1;
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const DEFAULT_PROVIDER_RETRY_COUNT = 1;

export class ProviderTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Provider call timed out after ${timeoutMs}ms.`);
    this.name = "ProviderTimeoutError";
    this.code = "provider_timeout";
    this.status = 504;
    this.transient = true;
  }
}

export function createRequestQueue({ concurrency = DEFAULT_CONCURRENCY } = {}) {
  const maxConcurrency = normalizePositiveInteger(concurrency, DEFAULT_CONCURRENCY);
  let running = 0;
  const pending = [];

  function runNext() {
    while (running < maxConcurrency && pending.length > 0) {
      const next = pending.shift();
      if (!next) {
        continue;
      }

      running += 1;
      next.task()
        .then(next.resolve, next.reject)
        .finally(() => {
          running -= 1;
          runNext();
        });
    }
  }

  return {
    enqueue(task) {
      return new Promise((resolve, reject) => {
        pending.push({ task, resolve, reject });
        runNext();
      });
    }
  };
}

export function createProviderInvoker({
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  retryCount = DEFAULT_PROVIDER_RETRY_COUNT,
  timers = globalThis
} = {}) {
  const requestTimeoutMs = normalizePositiveInteger(timeoutMs, DEFAULT_PROVIDER_TIMEOUT_MS);
  const maxRetries = normalizeRetryCount(retryCount);
  const timeoutFactory = timers?.setTimeout || setTimeout;
  const timeoutClear = timers?.clearTimeout || clearTimeout;

  return async function invokeProvider(operation, { allowRetry = true } = {}) {
    const allowedRetries = allowRetry ? maxRetries : 0;
    let attempt = 0;

    while (true) {
      try {
        return await withTimeout(operation, requestTimeoutMs, timeoutFactory, timeoutClear);
      } catch (error) {
        if (attempt >= allowedRetries || !isTransientProviderError(error)) {
          throw error;
        }
        attempt += 1;
      }
    }
  };
}

export function isTransientProviderError(error) {
  if (!error) {
    return false;
  }

  if (error.transient === true) {
    return true;
  }

  if (error.name === "ProviderTimeoutError") {
    return true;
  }

  if (error.name === "OllamaError") {
    if (error.code === "ollama_unreachable" || error.code === "ollama_upstream_error") {
      return true;
    }

    return Number.isInteger(error.status) && error.status >= 500 && error.status < 600;
  }

  return false;
}

async function withTimeout(operation, timeoutMs, timeoutFactory, timeoutClear) {
  const timeoutError = new ProviderTimeoutError(timeoutMs);

  return await new Promise((resolve, reject) => {
    const timeoutHandle = timeoutFactory(() => reject(timeoutError), timeoutMs);

    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => {
        timeoutClear(timeoutHandle);
      });
  });
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
}

function normalizeRetryCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROVIDER_RETRY_COUNT;
  }

  const rounded = Math.floor(parsed);
  return rounded >= 0 ? rounded : DEFAULT_PROVIDER_RETRY_COUNT;
}
