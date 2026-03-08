import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthMiddleware } from "./middleware/auth.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerCompletionsRoutes } from "./routes/completions.js";
import { registerEmbeddingsRoutes } from "./routes/embeddings.js";
import { registerModelsRoutes } from "./routes/models.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerDirectoryRoutes } from "./routes/directory.js";
import { registerBankrRoutes } from "./routes/bankr.js";
import { registerAppRoutes } from "./routes/app.js";
import { logger } from "../lib/logger.js";
import { loadConfig } from "../lib/config.js";
import { createOllamaClient } from "../providers/ollama.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function isLoopbackAddress(address = "") {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("127.")
  );
}

export async function buildServer({ apiKey, fetchImpl, ollamaFetchImpl, ollamaEnabled, ollamaBaseUrl } = {}) {
  const runtimeConfig = await loadConfig();
  const resolvedOllamaEnabled = ollamaEnabled ?? runtimeConfig.ollamaEnabled;
  const resolvedOllamaBaseUrl = ollamaBaseUrl ?? runtimeConfig.ollamaBaseUrl;
  const ollamaClient = createOllamaClient({
    enabled: resolvedOllamaEnabled,
    baseUrl: resolvedOllamaBaseUrl,
    fetchImpl: ollamaFetchImpl || fetchImpl
  });

  const fastify = Fastify({ logger: false });
  const authMiddleware = createAuthMiddleware({ apiKey });

  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/web/") || request.url.startsWith("/assets/")) {
      if (!isLoopbackAddress(request.ip)) {
        return reply.code(403).send({ error: "Static assets are restricted to local loopback access" });
      }
    }
  });

  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return authMiddleware(request, reply);
    }
  });

  await fastify.register(fastifyStatic, {
    root: path.join(repoRoot, "web"),
    prefix: "/web/",
    decorateReply: false
  });

  await fastify.register(fastifyStatic, {
    root: path.join(repoRoot, "assets"),
    prefix: "/assets/",
    decorateReply: false
  });

  await registerHealthRoutes(fastify);
  await registerModelsRoutes(fastify, { ollamaClient });
  await registerDirectoryRoutes(fastify, { fetchImpl });
  await registerBankrRoutes(fastify);
  await registerAppRoutes(fastify);
  await registerChatRoutes(fastify, { ollamaClient });
  await registerCompletionsRoutes(fastify, { ollamaClient });
  await registerEmbeddingsRoutes(fastify);

  return fastify;
}

export async function startServer({
  host = "127.0.0.1",
  port = 11435,
  apiKey,
  fetchImpl,
  ollamaFetchImpl,
  ollamaEnabled,
  ollamaBaseUrl
} = {}) {
  const server = await buildServer({
    apiKey,
    fetchImpl,
    ollamaFetchImpl,
    ollamaEnabled,
    ollamaBaseUrl
  });
  await server.listen({ host, port });
  await logger.info("server_started", { host, port });
  return server;
}
