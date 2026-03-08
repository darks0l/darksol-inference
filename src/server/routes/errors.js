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

export function handleRouteError(reply, error, model) {
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

  return openAIError(
    reply,
    500,
    "The server had an error while processing your request.",
    "server_error",
    "internal_server_error"
  );
}
