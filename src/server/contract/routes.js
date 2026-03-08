export const ROUTE_CONTRACT = [
  {
    method: "GET",
    path: "/health",
    summary: "Service health check",
    responses: {
      200: "Service status payload"
    }
  },
  {
    method: "GET",
    path: "/web/{filePath}",
    summary: "Serve local web shell files (loopback only)",
    parameters: [
      {
        name: "filePath",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "Static web file",
      403: "Remote clients are blocked",
      404: "File not found"
    }
  },
  {
    method: "GET",
    path: "/assets/{filePath}",
    summary: "Serve local asset files (loopback only)",
    parameters: [
      {
        name: "filePath",
        in: "path",
        required: true,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "Static asset file",
      403: "Remote clients are blocked",
      404: "File not found"
    }
  },
  {
    method: "GET",
    path: "/v1/models",
    summary: "List installed models in OpenAI list format (DARKSOL + Ollama when enabled)",
    auth: "bearer",
    responses: {
      200: "Model list",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/ollama/models",
    summary: "List Ollama local models",
    auth: "bearer",
    responses: {
      200: "Model list",
      400: "Ollama provider disabled",
      502: "Ollama unavailable",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/directory/models",
    summary: "Search HuggingFace model directory",
    auth: "bearer",
    parameters: [
      {
        name: "q",
        in: "query",
        required: false,
        schema: {
          type: "string"
        }
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100
        }
      },
      {
        name: "task",
        in: "query",
        required: false,
        schema: {
          type: "string"
        }
      }
    ],
    responses: {
      200: "Directory search result",
      400: "Invalid query parameters",
      401: "Missing or invalid API key",
      502: "Upstream directory unavailable"
    }
  },
  {
    method: "GET",
    path: "/v1/bankr/health",
    summary: "Bankr gateway config status",
    auth: "bearer",
    responses: {
      200: "Bankr gateway health payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "GET",
    path: "/v1/app/meta",
    summary: "App bootstrap metadata and route inventory",
    auth: "bearer",
    responses: {
      200: "Metadata payload",
      401: "Missing or invalid API key"
    }
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    summary: "OpenAI-compatible chat completions",
    auth: "bearer",
    responses: {
      200: "Chat completion result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  },
  {
    method: "POST",
    path: "/v1/completions",
    summary: "OpenAI-compatible text completions",
    auth: "bearer",
    responses: {
      200: "Text completion result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    summary: "OpenAI-compatible embeddings",
    auth: "bearer",
    responses: {
      200: "Embedding result",
      400: "Request validation error",
      401: "Missing or invalid API key",
      404: "Model not found",
      500: "Internal server error"
    }
  }
];

export function getRouteInventory() {
  return ROUTE_CONTRACT.map((route) => ({
    method: route.method,
    path: route.path
  }));
}

export function buildOpenApiPaths() {
  const paths = {};

  for (const route of ROUTE_CONTRACT) {
    const method = route.method.toLowerCase();
    const operation = {
      summary: route.summary,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([statusCode, description]) => [
          statusCode,
          { description }
        ])
      )
    };

    if (route.auth === "bearer") {
      operation.security = [{ bearerAuth: [] }];
    }

    if (route.parameters?.length) {
      operation.parameters = route.parameters;
    }

    paths[route.path] = paths[route.path] || {};
    paths[route.path][method] = operation;
  }

  return paths;
}
