import packageJson from "../../../package.json" with { type: "json" };
import { buildOpenApiPaths } from "./routes.js";

export function createOpenApiSpec({ serverUrl = "http://127.0.0.1:11435" } = {}) {
  return {
    openapi: "3.1.0",
    info: {
      title: "DARKSOL Inference API",
      version: packageJson.version,
      description: "Local inference server with OpenAI-compatible endpoints and static shell assets."
    },
    servers: [
      {
        url: serverUrl
      }
    ],
    paths: buildOpenApiPaths(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key"
        }
      }
    }
  };
}

export const OPENAPI_SPEC = createOpenApiSpec();
