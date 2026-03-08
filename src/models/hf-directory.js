const HF_MODELS_API_URL = "https://huggingface.co/api/models";

function normalizeModel(item) {
  return {
    id: item.id,
    downloads: item.downloads ?? 0,
    likes: item.likes ?? 0,
    pipeline_tag: item.pipeline_tag ?? null,
    library_name: item.library_name ?? null,
    lastModified: item.lastModified ?? null
  };
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
    async searchModels({ q, limit = 20, task } = {}) {
      const params = new URLSearchParams();
      params.set("limit", String(limit));

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
      return payload.map(normalizeModel);
    }
  };
}
