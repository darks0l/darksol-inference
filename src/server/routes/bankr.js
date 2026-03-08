import { createBankrClientFromEnv } from "../../bankr/client.js";

export async function registerBankrRoutes(fastify) {
  fastify.get("/v1/bankr/health", async () => {
    const client = createBankrClientFromEnv();
    return client.getHealthStatus();
  });
}
