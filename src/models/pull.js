import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { modelDir, modelFilePath, modelMetadataPath, modelsRoot } from "../lib/paths.js";

const MIN_FREE_BYTES_BUFFER = 32 * 1024 * 1024;

export class ModelPullError extends Error {
  constructor(message, { status = 500, code = "pull_failed", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ModelPullError";
    this.status = status;
    this.code = code;
  }
}

function createRequestHeaders() {
  const headers = { "User-Agent": "darksol/0.1.0" };
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function toModelApiUrl(repoId) {
  const [owner, name] = String(repoId).split("/");
  if (!owner || !name) {
    throw new ModelPullError(
      `Invalid HuggingFace model id '${repoId}'. Expected format 'owner/model'.`,
      { status: 400, code: "invalid_model_id" }
    );
  }
  return `https://huggingface.co/api/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function toModelDownloadUrl(repoId, fileName) {
  const [owner, name] = String(repoId).split("/");
  const encodedFilePath = fileName.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `https://huggingface.co/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/resolve/main/${encodedFilePath}?download=true`;
}

function mapFetchFailure(error, context) {
  if (error instanceof ModelPullError) {
    return error;
  }
  return new ModelPullError(`Could not reach HuggingFace while ${context}.`, {
    status: 502,
    code: "upstream_unreachable",
    cause: error
  });
}

async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { headers: createRequestHeaders() });
  } catch (error) {
    throw mapFetchFailure(error, "fetching model metadata");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ModelPullError("HuggingFace model was not found (404).", {
        status: 404,
        code: "model_not_found"
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new ModelPullError("HuggingFace authentication failed. Check HF token permissions.", {
        status: 401,
        code: "hf_auth_failed"
      });
    }
    throw new ModelPullError(`HuggingFace metadata request failed (${response.status}).`, {
      status: 502,
      code: "upstream_error"
    });
  }
  return response.json();
}

async function resolveGgufFile(repo, fileHint, fetchImpl) {
  const info = await fetchJson(toModelApiUrl(repo), fetchImpl);
  const siblings = (info.siblings || []).map((entry) => entry.rfilename).filter(Boolean);
  const ggufFiles = siblings.filter((name) => name.toLowerCase().endsWith(".gguf"));

  if (ggufFiles.length === 0) {
    throw new ModelPullError(`No GGUF files found in ${repo}.`, {
      status: 404,
      code: "gguf_not_found"
    });
  }

  if (fileHint) {
    const hint = fileHint.toLowerCase();
    const exact = ggufFiles.find((file) => file.toLowerCase() === hint || file.toLowerCase().endsWith(`/${hint}`));
    if (exact) {
      return { fileName: exact, info };
    }

    const byContains = ggufFiles.find((file) => file.toLowerCase().includes(hint) || file.toLowerCase().includes(`${hint}.gguf`));
    if (byContains) {
      return { fileName: byContains, info };
    }
  }

  return { fileName: ggufFiles[0], info };
}

async function ensureSufficientDiskSpace(targetPath, expectedBytes, fsPromisesApi) {
  if (!Number.isFinite(expectedBytes) || expectedBytes <= 0) {
    return;
  }
  try {
    const stat = await fsPromisesApi.statfs(targetPath);
    const availableBytes = Number(stat.bavail) * Number(stat.bsize);
    if (Number.isFinite(availableBytes) && availableBytes < expectedBytes + MIN_FREE_BYTES_BUFFER) {
      throw new ModelPullError("Insufficient disk space to download model.", {
        status: 507,
        code: "insufficient_storage"
      });
    }
  } catch (error) {
    if (error instanceof ModelPullError) {
      throw error;
    }
  }
}

function mapWriteFailure(error) {
  if (error?.code === "ENOSPC") {
    return new ModelPullError("Insufficient disk space while writing model file.", {
      status: 507,
      code: "insufficient_storage",
      cause: error
    });
  }
  return error;
}

export async function downloadModel({ spec, onProgress }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const fsPromisesApi = deps.fsPromisesApi || fsPromises;
  const fsApi = deps.fsApi || fs;
  const readFromWeb = deps.readFromWeb || Readable.fromWeb;

  const targetDir = modelDir(spec.localName);
  await fsPromisesApi.mkdir(targetDir, { recursive: true });

  const { fileName, info } = await resolveGgufFile(spec.repo, spec.fileHint, fetchImpl);
  const url = toModelDownloadUrl(spec.repo, fileName);
  let response;
  try {
    response = await fetchImpl(url, { headers: createRequestHeaders() });
  } catch (error) {
    throw mapFetchFailure(error, "downloading model weights");
  }

  if (!response.ok || !response.body) {
    if (response.status === 404) {
      throw new ModelPullError(`GGUF file not found in repository (${spec.repo}).`, {
        status: 404,
        code: "gguf_not_found"
      });
    }
    throw new ModelPullError(`Failed to download model (${response.status}).`, {
      status: 502,
      code: "download_failed"
    });
  }

  const total = Number(response.headers.get("content-length") || 0);
  await ensureSufficientDiskSpace(modelsRoot, total, fsPromisesApi);

  const destination = modelFilePath(spec.localName);
  const partialDestination = `${destination}.partial`;
  const writeStream = fsApi.createWriteStream(partialDestination);

  let downloaded = 0;
  const start = Date.now();
  if (onProgress) {
    onProgress({ downloaded: 0, total, speed: 0, eta: null });
  }

  const progressTransform = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.byteLength;
      const elapsed = Math.max((Date.now() - start) / 1000, 0.001);
      const speed = downloaded / elapsed;
      const eta = total > 0 ? (total - downloaded) / Math.max(speed, 1) : null;
      if (onProgress) {
        onProgress({ downloaded, total, speed, eta });
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(readFromWeb(response.body), progressTransform, writeStream);
    await fsPromisesApi.rename(partialDestination, destination);
  } catch (error) {
    await fsPromisesApi.rm(partialDestination, { force: true });
    throw mapWriteFailure(error);
  }

  const metadata = {
    name: spec.localName,
    requested: spec.requested,
    alias: spec.alias,
    repo: spec.repo,
    file: fileName,
    filePath: destination,
    downloadedAt: new Date().toISOString(),
    size: downloaded,
    quant: extractQuant(fileName),
    family: normalizeFamily(info?.pipeline_tag),
    parameterSize: extractParameterSize(fileName)
  };

  await fsPromisesApi.writeFile(modelMetadataPath(spec.localName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return metadata;
}

function extractQuant(fileName) {
  const matches = fileName.match(/q\d(?:_[a-z0-9]+)?/i);
  return matches ? matches[0].toUpperCase() : "unknown";
}

function extractParameterSize(fileName) {
  const match = String(fileName).match(/(?:^|[-_])(\d+(?:\.\d+)?)(b)(?:[-_.]|$)/i);
  if (!match) {
    return null;
  }
  return `${match[1].toUpperCase()}${match[2].toUpperCase()}`;
}

function normalizeFamily(pipelineTag) {
  if (!pipelineTag || typeof pipelineTag !== "string") {
    return null;
  }

  if (pipelineTag.includes("feature-extraction")) {
    return "embedding";
  }

  if (pipelineTag.includes("text-generation")) {
    return "text-generation";
  }

  return pipelineTag;
}
