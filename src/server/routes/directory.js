import { createHfDirectoryClient, DirectoryFetchError } from "../../models/hf-directory.js";
import { detectHardware } from "../../hardware/detect.js";
import { openAIError } from "./errors.js";

const MAX_LIMIT = 100;
const SUPPORTED_SORTS = new Set(["trending", "popular", "downloads", "recent", "likes"]);
const SUPPORTED_FIT_FILTERS = new Set(["recommended", "will_fit", "might_fit", "any"]);

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return false;
}

export async function registerDirectoryRoutes(fastify, { fetchImpl, detectHardwareFn } = {}) {
  const client = createHfDirectoryClient({ fetchImpl });
  const detectHardwareImpl = detectHardwareFn || detectHardware;

  fastify.get("/v1/directory/models", async (request, reply) => {
    const { q, task } = request.query;
    const sort = request.query.sort || "trending";
    const fit = request.query.fit || "recommended";
    const hardwareAware = parseBoolean(request.query.hardware_aware);
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
    if (!SUPPORTED_SORTS.has(sort)) {
      return openAIError(
        reply,
        400,
        "Invalid 'sort'. Expected one of trending|popular|downloads|recent|likes.",
        "invalid_request_error",
        "invalid_sort"
      );
    }
    if (!SUPPORTED_FIT_FILTERS.has(fit)) {
      return openAIError(
        reply,
        400,
        "Invalid 'fit'. Expected one of recommended|will_fit|might_fit|any.",
        "invalid_request_error",
        "invalid_fit"
      );
    }

    try {
      const hardware = hardwareAware
        ? {
            fitFilter: fit,
            details: await detectHardwareImpl()
          }
        : null;
      const items = await client.searchModels({ q, task, limit, sort, hardware });
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
