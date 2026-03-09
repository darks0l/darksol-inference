import fs from "node:fs/promises";
import path from "node:path";
import { ensureModelInstalled, listInstalledModels } from "../../models/manager.js";
import { modelPool } from "../../engine/pool.js";
import { createOllamaClient, toOllamaModelName } from "../../providers/ollama.js";
import { discoverOllamaLocalModels, resolveOllamaLocalModel } from "../../providers/ollama-local.js";
import { setRegistryModel } from "../../models/registry.js";
import { modelDir, modelFilePath, modelMetadataPath } from "../../lib/paths.js";
import { openAIError } from "./errors.js";

function normalizeImportedModelName(input) {
  return String(input || "")
    .trim()
    .replace(/^ollama\//, "")
    .replace(/[^a-zA-Z0-9._:/-]/g, "-");
}

async function tryLinkOrCopy(fromPath, toPath, mode = "link") {
  if (mode === "copy") {
    await fs.copyFile(fromPath, toPath);
    return "copy";
  }

  try {
    await fs.link(fromPath, toPath);
    return "link";
  } catch {
    await fs.copyFile(fromPath, toPath);
    return "copy";
  }
}

export async function registerModelsRoutes(fastify, { ollamaClient } = {}) {
  const client = ollamaClient || createOllamaClient();

  fastify.get("/v1/models", async () => {
    const installed = await listInstalledModels();
    const loadedNames = new Set(modelPool.listLoaded().map((m) => m.name));

    // Discover Ollama models from filesystem first (no daemon needed)
    let ollamaModels = [];
    try {
      ollamaModels = await discoverOllamaLocalModels();
    } catch {
      ollamaModels = [];
    }

    // If filesystem discovery found nothing and Ollama daemon is available, try API
    if (ollamaModels.length === 0 && client.enabled) {
      try {
        const apiModels = await client.listLocalModels();
        ollamaModels = apiModels.map((m) => ({
          id: m.id,
          name: m.name,
          size: m.size,
          quant: m.quant,
          family: m.family,
          parameterSize: m.parameterSize,
          modifiedAt: m.modifiedAt,
          ggufPath: null
        }));
      } catch {
        ollamaModels = [];
      }
    }

    // Deduplicate: skip Ollama models already registered in Darksol
    const installedNames = new Set(installed.map((m) => m.name));
    const dedupedOllama = ollamaModels.filter((m) => !installedNames.has(m.id) && !installedNames.has(m.name));

    return {
      object: "list",
      data: [
        ...installed.map((model) => ({
          id: model.name,
          object: "model",
          owned_by: "darksol",
          provider: "darksol",
          created: model.downloadedAt ? Math.floor(new Date(model.downloadedAt).getTime() / 1000) : 0,
          loaded: loadedNames.has(model.name)
        })),
        ...dedupedOllama.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "ollama",
          provider: "ollama",
          created: model.modifiedAt ? Math.floor(new Date(model.modifiedAt).getTime() / 1000) : 0,
          loaded: loadedNames.has(model.id),
          size: model.size,
          gguf_available: !!model.ggufPath
        }))
      ]
    };
  });

  fastify.get("/v1/ollama/models", async (request, reply) => {
    if (!client.enabled) {
      return openAIError(reply, 400, "Ollama provider is disabled.", "invalid_request_error", "ollama_disabled");
    }

    try {
      const models = await client.listLocalModels();
      return {
        object: "list",
        data: models.map((model) => ({
          id: model.id,
          object: "model",
          owned_by: "ollama",
          provider: "ollama",
          created: model.modifiedAt ? Math.floor(new Date(model.modifiedAt).getTime() / 1000) : 0,
          size: model.size,
          quant: model.quant,
          family: model.family,
          parameter_size: model.parameterSize
        }))
      };
    } catch (error) {
      return openAIError(
        reply,
        error.status || 502,
        error.message || "Failed to reach Ollama.",
        "api_error",
        error.code || "ollama_error"
      );
    }
  });

  fastify.post("/v1/models/pull", async (request, reply) => {
    const body = request.body || {};
    const name = String(body.name || body.model || "").trim();
    if (!name) {
      return openAIError(reply, 400, "name is required", "invalid_request_error", "model_required");
    }

    try {
      const result = await ensureModelInstalled(name);
      return {
        ok: true,
        object: "model",
        downloaded: result.downloaded,
        metadata: result.metadata
      };
    } catch (error) {
      return openAIError(
        reply,
        error.status || 502,
        error.message || "Failed to pull model.",
        "api_error",
        error.code || "pull_failed"
      );
    }
  });

  fastify.post("/v1/models/import-ollama", async (request, reply) => {
    const body = request.body || {};
    const incomingId = body.modelId || body.id || body.model;
    const modelId = normalizeImportedModelName(incomingId);
    const mode = String(body.mode || "link").toLowerCase() === "copy" ? "copy" : "link";

    if (!modelId) {
      return openAIError(reply, 400, "modelId is required", "invalid_request_error", "model_required");
    }

    const ollamaName = toOllamaModelName(modelId);
    const discovered = await resolveOllamaLocalModel(ollamaName).catch(() => null);
    if (!discovered?.ggufPath) {
      return openAIError(reply, 404, `Ollama local model not found: ${modelId}`, "invalid_request_error", "model_not_found");
    }

    const targetName = normalizeImportedModelName(body.alias || ollamaName);
    const destinationDir = modelDir(targetName);
    const destinationFile = modelFilePath(targetName);

    await fs.mkdir(destinationDir, { recursive: true });

    try {
      await fs.access(destinationFile);
      return openAIError(reply, 409, `Model already exists: ${targetName}`, "invalid_request_error", "model_exists");
    } catch {
      // destination missing, continue
    }

    const effectiveMode = await tryLinkOrCopy(discovered.ggufPath, destinationFile, mode);

    const metadata = {
      name: targetName,
      requested: `ollama/${ollamaName}`,
      alias: null,
      repo: "ollama-local",
      file: path.basename(destinationFile),
      filePath: destinationFile,
      downloadedAt: new Date().toISOString(),
      size: discovered.size || 0,
      quant: discovered.quant || "unknown",
      family: discovered.family || null,
      parameterSize: discovered.parameterSize || null,
      source: "ollama-local",
      importMode: effectiveMode,
      sourcePath: discovered.ggufPath
    };

    await fs.writeFile(modelMetadataPath(targetName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await setRegistryModel(targetName, metadata);

    return {
      ok: true,
      object: "model",
      imported: targetName,
      mode: effectiveMode,
      source: `ollama/${ollamaName}`,
      metadata
    };
  });
}
