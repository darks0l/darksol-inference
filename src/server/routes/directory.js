import { createHfDirectoryClient, DirectoryFetchError } from "../../models/hf-directory.js";
import { openAIError } from "./errors.js";

const MAX_LIMIT = 100;

export async function registerDirectoryRoutes(fastify, { fetchImpl } = {}) {
  const client = createHfDirectoryClient({ fetchImpl });

  fastify.get("/v1/directory/models", async (request, reply) => {
    const { q, task } = request.query;
    const limit = Number(request.query.limit ?? 20);

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return openAIError(
        reply,
        400,
        `Invalid 'limit'. Expected an integer between 1 and ${MAX_LIMIT}.`,
        "invalid_request_error",
        "invalid_limit"
      );
    }

    try {
      const items = await client.searchModels({ q, task, limit });
      return { object: "list", items };
    } catch (error) {
      if (error instanceof DirectoryFetchError) {
        return openAIError(reply, error.status, error.message, "api_error", error.code);
      }

      return openAIError(
        reply,
        500,
        "The server had an error while processing your request.",
        "server_error",
        "internal_server_error"
      );
    }
  });
}
