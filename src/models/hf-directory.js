const HF_MODELS_API_URL = "https://huggingface.co/api/models";
const SUPPORTED_SORTS = new Set(["trending", "popular", "downloads", "recent", "likes"]);
const SUPPORTED_FIT_FILTERS = new Set(["recommended", "will_fit", "might_fit", "any"]);

function resolveSort(sort = "trending") {
  switch (sort) {
    case "popular":
    case "downloads":
      return { sort: "downloads", direction: "-1" };
    case "recent":
    case "trending":
      return { sort: "lastModified", direction: "-1" };
    case "likes":
      return { sort: "likes", direction: "-1" };
    default:
      return null;
  }
}

function estimateGgufSizeBytes(item) {
  const siblings = Array.isArray(item?.siblings) ? item.siblings : [];
  const ggufSiblings = siblings.filter((entry) => String(entry?.rfilename || "").toLowerCase().endsWith(".gguf"));
  const siblingSizes = ggufSiblings.map((entry) => Number(entry?.size) || 0).filter((value) => value > 0);
  if (siblingSizes.length > 0) {
    return Math.min(...siblingSizes);
  }

  const usedStorage = Number(item?.usedStorage) || 0;
  return usedStorage > 0 ? usedStorage : null;
}

function bytesToGiB(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  return bytes / (1024 ** 3);
}

function buildCompatibility(sizeBytes, hardware) {
  if (!hardware) {
    return null;
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return {
      indicator: "might_fit",
      label: "might fit",
      reason: "Model size is unknown."
    };
  }

  const freeRam = Number(hardware?.memory?.free) || 0;
  const totalRam = Number(hardware?.memory?.total) || 0;
  const freeVram = Number(hardware?.freeVramMb) > 0 ? Number(hardware.freeVramMb) * 1024 * 1024 : 0;
  const totalVram = Number(hardware?.totalVramMb) > 0 ? Number(hardware.totalVramMb) * 1024 * 1024 : 0;

  const requiredBytes = Math.ceil(sizeBytes * 1.2);
  const fitsFree = requiredBytes <= freeRam || (freeVram > 0 && requiredBytes <= freeVram);
  if (fitsFree) {
    return {
      indicator: "will_fit",
      label: "will fit",
      reason: `Estimated ${bytesToGiB(sizeBytes)?.toFixed(1)} GiB model fits current free memory.`
    };
  }

  const fitsTotal = requiredBytes <= totalRam || (totalVram > 0 && requiredBytes <= totalVram);
  if (fitsTotal) {
    return {
      indicator: "might_fit",
      label: "might fit",
      reason: "May fit after freeing memory or lowering concurrent workloads."
    };
  }

  return {
    indicator: "wont_fit",
    label: "won't fit",
    reason: "Estimated model footprint exceeds available RAM/VRAM."
  };
}

function shouldIncludeModel(item, fitFilter) {
  const indicator = item?.compatibility?.indicator;
  if (fitFilter === "any") {
    return true;
  }
  if (fitFilter === "will_fit") {
    return indicator === "will_fit";
  }
  if (fitFilter === "might_fit") {
    return indicator === "might_fit";
  }
  if (fitFilter === "recommended") {
    return indicator !== "wont_fit";
  }
  return true;
}

function normalizeModel(item, { includeHardwareFields = false, hardware } = {}) {
  const normalized = {
    id: item.id,
    downloads: item.downloads ?? 0,
    likes: item.likes ?? 0,
    pipeline_tag: item.pipeline_tag ?? null,
    library_name: item.library_name ?? null,
    lastModified: item.lastModified ?? null
  };

  if (includeHardwareFields) {
    const ggufSizeBytes = estimateGgufSizeBytes(item);
    normalized.gguf_size_bytes = ggufSizeBytes;
    normalized.gguf_size_gib = bytesToGiB(ggufSizeBytes);
    normalized.compatibility = buildCompatibility(ggufSizeBytes, hardware);
  }

  return normalized;
}

export class DirectoryFetchError extends Error {
  constructor(message, { status = 502, code = "upstream_error" } = {}) {
    super(message);
    this.name = "DirectoryFetchError";
    this.status = status;
    this.code = code;
  }
}

export function createHfDirectoryClient({ token = process.env.HUGGINGFACE_TOKEN, fetchImpl = fetch } = {}) {
  return {
    async searchModels({ q, limit = 20, task, sort = "trending", hardware } = {}) {
      if (!SUPPORTED_SORTS.has(sort)) {
        throw new DirectoryFetchError(`Unsupported sort '${sort}'.`, {
          status: 400,
          code: "invalid_sort"
        });
      }

      const hardwareAware = Boolean(hardware);
      const fitFilter = hardwareAware ? (hardware.fitFilter || "recommended") : "any";
      if (hardwareAware && !SUPPORTED_FIT_FILTERS.has(fitFilter)) {
        throw new DirectoryFetchError(`Unsupported fit filter '${fitFilter}'.`, {
          status: 400,
          code: "invalid_fit"
        });
      }

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("full", "true");

      const sortSpec = resolveSort(sort);
      if (sortSpec?.sort) {
        params.set("sort", sortSpec.sort);
      }
      if (sortSpec?.direction) {
        params.set("direction", sortSpec.direction);
      }

      if (q) {
        params.set("search", q);
      }

      if (task) {
        params.set("pipeline_tag", task);
      }

      const headers = { "User-Agent": "darksol/0.1.0" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      let response;
      try {
        response = await fetchImpl(`${HF_MODELS_API_URL}?${params.toString()}`, { headers });
      } catch {
        throw new DirectoryFetchError("Could not reach HuggingFace model directory.", {
          status: 502,
          code: "upstream_unreachable"
        });
      }

      if (!response.ok) {
        throw new DirectoryFetchError(`HuggingFace model directory request failed (${response.status}).`, {
          status: 502,
          code: "upstream_error"
        });
      }

      const payload = await response.json();
      const normalized = payload.map((item) =>
        normalizeModel(item, {
          includeHardwareFields: hardwareAware,
          hardware: hardware?.details
        })
      );

      if (!hardwareAware) {
        return normalized;
      }

      return normalized.filter((item) => shouldIncludeModel(item, fitFilter));
    }
  };
}
