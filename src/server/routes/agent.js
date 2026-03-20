/**
 * API route: /v1/agent — Deep Agent execution via HTTP.
 * Supports both one-shot and streaming responses.
 */

import { createDarksolAgent } from "../../agent/deep-agent.js";

/**
 * Register agent routes on the Fastify server.
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function registerAgentRoutes(fastify) {
  /**
   * POST /v1/agent/run — Execute a deep agent task
   *
   * Body:
   *   message: string (required) — The task to execute
   *   model: string — Model to use (default: "auto")
   *   system_prompt: string — Custom system prompt
   *   max_iterations: number — Max tool-call loops (default: 50)
   *   stream: boolean — Stream events via SSE (default: false)
   *   cwd: string — Working directory
   *   planning: boolean — Enable planning/todos (default: true)
   */
  fastify.post("/v1/agent/run", async (request, reply) => {
    const {
      message,
      model = "auto",
      system_prompt,
      max_iterations = 50,
      stream = false,
      cwd,
      planning = true,
    } = request.body || {};

    if (!message || typeof message !== "string") {
      return reply.status(400).send({
        error: { message: "message is required and must be a string" },
      });
    }

    // Use local server as the API base (agent calls itself)
    const apiBase = `http://127.0.0.1:${fastify.server.address()?.port || 11435}`;

    if (stream) {
      // SSE streaming mode
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      if (typeof reply.raw.flushHeaders === "function") {
        reply.raw.flushHeaders();
      }

      const agent = createDarksolAgent({
        model,
        apiBase,
        systemPrompt: system_prompt,
        maxIterations: max_iterations,
        cwd,
        planning,
        onStep: (type, data) => {
          const event = JSON.stringify({ type, data, timestamp: Date.now() });
          reply.raw.write(`data: ${event}\n\n`);
        },
      });

      try {
        const result = await agent.run(message);
        reply.raw.write(`data: ${JSON.stringify({
          type: "done",
          data: {
            response: result.response,
            iterations: result.iterations,
            totalTokensEstimate: result.totalTokensEstimate,
            todos: result.todos,
          },
        })}\n\n`);
      } catch (err) {
        reply.raw.write(`data: ${JSON.stringify({
          type: "error",
          data: { message: err.message },
        })}\n\n`);
      }

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    // Non-streaming: return full result
    const agent = createDarksolAgent({
      model,
      apiBase,
      systemPrompt: system_prompt,
      maxIterations: max_iterations,
      cwd,
      planning,
    });

    try {
      const result = await agent.run(message);
      return reply.send({
        response: result.response,
        iterations: result.iterations,
        totalTokensEstimate: result.totalTokensEstimate,
        todos: result.todos,
      });
    } catch (err) {
      return reply.status(500).send({
        error: { message: err.message },
      });
    }
  });

  /**
   * GET /v1/agent/tools — List available agent tools
   */
  fastify.get("/v1/agent/tools", async (_request, reply) => {
    const { TOOL_DEFINITIONS } = await import("../../agent/tools.js");
    return reply.send({
      tools: TOOL_DEFINITIONS.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    });
  });
}
