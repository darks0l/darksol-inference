export function openAIError(reply, status, message, type, code) {
  return reply.code(status).send({
    error: {
      message,
      type,
      code
    }
  });
}

export function handleRouteError(reply, error, model) {
  if (error?.message?.startsWith("Model not installed:")) {
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
