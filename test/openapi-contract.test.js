import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildServer } from "../src/server/index.js";
import { OPENAPI_SPEC } from "../src/server/contract/openapi.js";
import { getRouteInventory } from "../src/server/contract/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

test("Generated contract routes align with /v1/app/meta route inventory", async () => {
  const server = await buildServer();

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v1/app/meta"
    });
    const body = response.json();
    const openApiRaw = await readFile(path.join(repoRoot, "docs", "openapi.json"), "utf8");
    const openApi = JSON.parse(openApiRaw);

    const specRouteSet = new Set(getRouteInventory().map((route) => `${route.method} ${route.path}`));
    const appMetaRouteSet = new Set((body.routes || []).map((route) => `${route.method} ${route.path}`));
    const docsSpecRouteSet = new Set(getRoutesFromPaths(openApi.paths).map((route) => `${route.method} ${route.path}`));

    assert.deepEqual([...appMetaRouteSet].sort(), [...specRouteSet].sort());
    assert.deepEqual([...docsSpecRouteSet].sort(), [...specRouteSet].sort());
  } finally {
    await server.close();
  }
});

test("docs/openapi.json stays in sync with generated OpenAPI contract", async () => {
  const openApiRaw = await readFile(path.join(repoRoot, "docs", "openapi.json"), "utf8");
  const openApi = JSON.parse(openApiRaw);

  assert.deepEqual(openApi, OPENAPI_SPEC);
});

function getRoutesFromPaths(paths = {}) {
  const routes = [];

  for (const [pathName, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (operation && typeof operation === "object") {
        routes.push({ method: method.toUpperCase(), path: pathName });
      }
    }
  }

  return routes;
}
