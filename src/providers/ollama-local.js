import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { toOllamaModelId } from "./ollama.js";

function digestToBlobFilename(digest) {
  if (!digest || typeof digest !== "string") {
    return null;
  }
  return digest.replace(":", "-");
}

function normalizeManifestModelName(manifestRelativePath) {
  const segments = String(manifestRelativePath).split(/[/\\]+/).filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const tag = segments.at(-1);
  const modelSegments = segments.slice(1, -1);

  if (modelSegments[0] === "library") {
    modelSegments.shift();
  }

  if (!tag || modelSegments.length === 0) {
    return null;
  }

  return `${modelSegments.join("/")}:${tag}`;
}

async function fileExists(filePath, fsImpl) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFilesRecursive(root, fsImpl, pathImpl) {
  const discovered = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = await fsImpl.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextPath = pathImpl.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (entry.isFile()) {
        discovered.push(nextPath);
      }
    }
  }

  return discovered;
}

async function readConfigBlob(configDigest, blobsRoot, fsImpl, pathImpl) {
  const configBlob = digestToBlobFilename(configDigest);
  if (!configBlob) {
    return {};
  }

  const configPath = pathImpl.join(blobsRoot, configBlob);
  try {
    const raw = await fsImpl.readFile(configPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toModelMetadata({ name, modelLayer, ggufPath, manifestPath, configBlob, stat }) {
  return {
    id: toOllamaModelId(name),
    name,
    size: Number(modelLayer?.size) || 0,
    quant: configBlob.file_type || null,
    family: configBlob.model_family || null,
    parameterSize: configBlob.model_type || null,
    modifiedAt: stat?.mtime ? stat.mtime.toISOString() : null,
    ggufPath,
    manifestPath
  };
}

export function resolveOllamaModelsRoot({
  platform = process.platform,
  homedir = os.homedir(),
  env = process.env,
  pathImpl = path
} = {}) {
  if (platform === "win32") {
    const userProfile = env.USERPROFILE || homedir;
    return pathImpl.join(userProfile, ".ollama", "models");
  }

  return pathImpl.join(homedir, ".ollama", "models");
}

export async function discoverOllamaLocalModels({
  fsImpl = fs,
  pathImpl = path,
  modelsRoot = resolveOllamaModelsRoot()
} = {}) {
  const manifestsRoot = pathImpl.join(modelsRoot, "manifests");
  const blobsRoot = pathImpl.join(modelsRoot, "blobs");
  const manifestPaths = await walkFilesRecursive(manifestsRoot, fsImpl, pathImpl);
  const discovered = [];

  for (const manifestPath of manifestPaths.sort()) {
    const relativePath = pathImpl.relative(manifestsRoot, manifestPath);
    const name = normalizeManifestModelName(relativePath);
    if (!name) {
      continue;
    }

    let manifest = null;
    try {
      const rawManifest = await fsImpl.readFile(manifestPath, "utf8");
      manifest = JSON.parse(rawManifest);
    } catch {
      continue;
    }

    const modelLayer = (Array.isArray(manifest.layers) ? manifest.layers : []).find((layer) =>
      String(layer?.mediaType || "").includes(".model")
    );

    const modelBlobName = digestToBlobFilename(modelLayer?.digest);
    if (!modelBlobName) {
      continue;
    }

    const ggufPath = pathImpl.join(blobsRoot, modelBlobName);
    if (!(await fileExists(ggufPath, fsImpl))) {
      continue;
    }

    const configBlob = await readConfigBlob(manifest.config?.digest, blobsRoot, fsImpl, pathImpl);

    let stat = null;
    try {
      stat = await fsImpl.stat(manifestPath);
    } catch {
      stat = null;
    }

    discovered.push(
      toModelMetadata({
        name,
        modelLayer,
        ggufPath,
        manifestPath,
        configBlob,
        stat
      })
    );
  }

  discovered.sort((a, b) => a.name.localeCompare(b.name));
  return discovered;
}

function normalizeRequestedModelName(modelName) {
  const trimmed = String(modelName || "").trim().replace(/^ollama\//, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.includes(":") ? trimmed : `${trimmed}:latest`;
}

export async function resolveOllamaLocalModel(modelName, { models, ...options } = {}) {
  const normalized = normalizeRequestedModelName(modelName);
  if (!normalized) {
    return null;
  }

  const allModels = Array.isArray(models) ? models : await discoverOllamaLocalModels(options);
  return allModels.find((item) => item.name === normalized) || null;
}

export async function resolveOllamaLocalGgufPath(modelName, options = {}) {
  const model = await resolveOllamaLocalModel(modelName, options);
  return model?.ggufPath || null;
}
