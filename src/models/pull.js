import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { modelDir, modelFilePath, modelMetadataPath } from "../lib/paths.js";

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "darksol/0.1.0" } });
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
  const response = await fetch(url, { headers: { "User-Agent": "darksol/0.1.0" } });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download model (${response.status})`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  const destination = modelFilePath(spec.localName);
  const writeStream = fs.createWriteStream(destination);

  let downloaded = 0;
  const start = Date.now();

  const progressStream = new TransformStream({
    transform(chunk, controller) {
      downloaded += chunk.length;
      const elapsed = Math.max((Date.now() - start) / 1000, 0.001);
      const speed = downloaded / elapsed;
      const eta = total > 0 ? (total - downloaded) / Math.max(speed, 1) : null;
      if (onProgress) {
        onProgress({ downloaded, total, speed, eta });
      }
      controller.enqueue(chunk);
    }
  });

  await pipeline(Readable.fromWeb(response.body.pipeThrough(progressStream)), writeStream);

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
