export async function registerHealthRoutes(fastify) {
  fastify.get("/health", async () => ({
    status: "ok",
    service: "darksol-inference",
    timestamp: new Date().toISOString()
  }));
}
