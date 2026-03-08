import Fastify from "fastify";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerCompletionsRoutes } from "./routes/completions.js";
import { registerEmbeddingsRoutes } from "./routes/embeddings.js";
import { registerModelsRoutes } from "./routes/models.js";
import { registerHealthRoutes } from "./routes/health.js";
import { logger } from "../lib/logger.js";

export async function buildServer({ apiKey } = {}) {
  const fastify = Fastify({ logger: false });
  const authMiddleware = createAuthMiddleware({ apiKey });

  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return authMiddleware(request, reply);
    }
  });

  await registerHealthRoutes(fastify);
  await registerModelsRoutes(fastify);
  await registerChatRoutes(fastify);
  await registerCompletionsRoutes(fastify);
  await registerEmbeddingsRoutes(fastify);

  return fastify;
}

export async function startServer({ host = "127.0.0.1", port = 11435, apiKey } = {}) {
  const server = await buildServer({ apiKey });
  await server.listen({ host, port });
  await logger.info("server_started", { host, port });
  return server;
}
