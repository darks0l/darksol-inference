export function openAIError(reply, status, message, type, code) {
  return reply.code(status).send({
    error: {
      message,
      type,
      param: null,
      code
    }
  });
}

export function isModelNotInstalledError(error) {
  const message = String(error?.message || "");
  return message.startsWith("Model not installed:") || message.toLowerCase().includes("not found");
}

function isNoModelsInstalledError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("no models installed") || message.includes("model not installed:");
}

function isModelTooLargeForRamError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("insufficient memory") ||
    message.includes("out of memory") ||
    message.includes("not enough memory") ||
    message.includes("alloc") && message.includes("failed")
  );
}

function isCorruptOrIncompatibleModelError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("gguf") && message.includes("invalid") ||
    message.includes("corrupt") ||
    message.includes("unsupported model file format") ||
    message.includes("failed to load model")
  );
}

export function handleRouteError(reply, error, model) {
  if (error?.name === "ProviderTimeoutError") {
    return openAIError(reply, 504, error.message, "api_error", "provider_timeout");
  }

  if (error?.name === "OllamaError") {
    const isModelError = error.code === "model_not_found";
    return openAIError(
      reply,
      error.status || (isModelError ? 404 : 502),
      isModelError
        ? `The model '${model}' does not exist in Ollama local inventory.`
        : error.message || "Failed to reach Ollama.",
      isModelError ? "invalid_request_error" : "api_error",
      error.code || (isModelError ? "model_not_found" : "ollama_error")
    );
  }

  if (isModelNotInstalledError(error) && model) {
    return openAIError(
      reply,
      404,
      `The model '${model}' does not exist or is not installed.`,
      "invalid_request_error",
      "model_not_found"
    );
  }

  if (isNoModelsInstalledError(error)) {
    return openAIError(
      reply,
      404,
      "No models were found. Install one with `darksol pull <model>` and try again.",
      "invalid_request_error",
      "model_not_found"
    );
  }

  if (isModelTooLargeForRamError(error)) {
    return openAIError(
      reply,
      400,
      "The selected model is too large for available system memory. Try a smaller quantized model.",
      "invalid_request_error",
      "model_too_large"
    );
  }

  if (isCorruptOrIncompatibleModelError(error)) {
    return openAIError(
      reply,
      400,
      "The GGUF file appears corrupt or incompatible with this runtime. Re-download the model or choose another quant.",
      "invalid_request_error",
      "invalid_model_file"
    );
  }

  return openAIError(
    reply,
    500,
    "The server had an error while processing your request.",
    "server_error",
    "internal_server_error"
  );
}
