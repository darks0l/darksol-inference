import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildServer } from "../src/server/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

test("OpenAPI contract paths align with /v1/app/meta route inventory", async () => {
  const server = await buildServer();

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v1/app/meta"
    });
    const body = response.json();
    const openApiRaw = await readFile(path.join(repoRoot, "docs", "openapi.json"), "utf8");
    const openApi = JSON.parse(openApiRaw);

    const specRoutes = [];
    for (const [pathName, pathItem] of Object.entries(openApi.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem || {})) {
        if (operation && typeof operation === "object") {
          specRoutes.push({ method: method.toUpperCase(), path: pathName });
        }
      }
    }

    const specRouteSet = new Set(specRoutes.map((route) => `${route.method} ${route.path}`));
    const appMetaRouteSet = new Set((body.routes || []).map((route) => `${route.method} ${route.path}`));

    assert.deepEqual([...appMetaRouteSet].sort(), [...specRouteSet].sort());
  } finally {
    await server.close();
  }
});
