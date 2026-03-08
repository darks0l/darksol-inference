import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { modelDir, modelFilePath, modelMetadataPath } from "../lib/paths.js";

function createRequestHeaders() {
  const headers = { "User-Agent": "darksol/0.1.0" };
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: createRequestHeaders() });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function resolveGgufFile(repo, fileHint) {
  const info = await fetchJson(`https://huggingface.co/api/models/${repo}`);
  const siblings = (info.siblings || []).map((entry) => entry.rfilename).filter(Boolean);
  const ggufFiles = siblings.filter((name) => name.toLowerCase().endsWith(".gguf"));

  if (ggufFiles.length === 0) {
    throw new Error(`No GGUF files found in ${repo}`);
  }

  if (fileHint) {
    const hint = fileHint.toLowerCase();
    const exact = ggufFiles.find((file) => file.toLowerCase() === hint || file.toLowerCase().endsWith(`/${hint}`));
    if (exact) {
      return exact;
    }

    const byContains = ggufFiles.find((file) => file.toLowerCase().includes(hint) || file.toLowerCase().includes(`${hint}.gguf`));
    if (byContains) {
      return byContains;
    }
  }

  return ggufFiles[0];
}

export async function downloadModel({ spec, onProgress }) {
  const targetDir = modelDir(spec.localName);
  await fsPromises.mkdir(targetDir, { recursive: true });

  const fileName = await resolveGgufFile(spec.repo, spec.fileHint);
  const url = `https://huggingface.co/${spec.repo}/resolve/main/${fileName}?download=true`;
  const response = await fetch(url, { headers: createRequestHeaders() });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download model (${response.status})`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  const destination = modelFilePath(spec.localName);
  const partialDestination = `${destination}.partial`;
  const writeStream = fs.createWriteStream(partialDestination);

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
    await pipeline(Readable.fromWeb(response.body), progressTransform, writeStream);
    await fsPromises.rename(partialDestination, destination);
  } catch (error) {
    await fsPromises.rm(partialDestination, { force: true });
    throw error;
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
    quant: extractQuant(fileName)
  };

  await fsPromises.writeFile(modelMetadataPath(spec.localName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return metadata;
}

function extractQuant(fileName) {
  const matches = fileName.match(/q\d(?:_[a-z0-9]+)?/i);
  return matches ? matches[0].toUpperCase() : "unknown";
}
