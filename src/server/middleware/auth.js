export function createAuthMiddleware({ apiKey }) {
  return async function authMiddleware(request, reply) {
    if (!apiKey) {
      return;
    }

    const authHeader = request.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: { message: "Missing bearer token", type: "invalid_request_error" } });
      return reply;
    }

    const token = authHeader.slice("Bearer ".length);
    if (token !== apiKey) {
      reply.code(401).send({ error: { message: "Invalid API key", type: "invalid_request_error" } });
      return reply;
    }
  };
}
