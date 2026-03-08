const CATEGORY_MAP = {
  chat: "text-generation",
  code: "text-generation",
  vision: "image-to-text",
  embed: "feature-extraction"
};

export async function browseModels({ category, sort = "trending", limit = 20 } = {}) {
  const params = new URLSearchParams();
  params.set("sort", sort);
  params.set("filter", "gguf");
  params.set("limit", String(limit));

  if (category && CATEGORY_MAP[category]) {
    params.set("pipeline_tag", CATEGORY_MAP[category]);
  }

  const url = `https://huggingface.co/api/models?${params.toString()}`;
  const response = await fetch(url, { headers: { "User-Agent": "darksol/0.1.0" } });

  if (!response.ok) {
    throw new Error(`Failed to browse models (${response.status})`);
  }

  const data = await response.json();
  return data.map((item) => ({
    id: item.id,
    downloads: item.downloads || 0,
    likes: item.likes || 0,
    updatedAt: item.lastModified || null,
    description: item.description || "",
    tags: item.tags || []
  }));
}
