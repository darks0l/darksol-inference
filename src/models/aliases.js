export const MODEL_ALIASES = {
  "llama3:8b": { repo: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", fileHint: "Q4_K_M" },
  "llama3:70b": { repo: "bartowski/Meta-Llama-3.1-70B-Instruct-GGUF", fileHint: "Q4_K_M" },
  "mistral:7b": { repo: "bartowski/Mistral-7B-Instruct-v0.3-GGUF", fileHint: "Q4_K_M" },
  "qwen2.5:14b": { repo: "bartowski/Qwen2.5-14B-Instruct-GGUF", fileHint: "Q4_K_M" },
  "codestral:22b": { repo: "bartowski/Codestral-22B-v0.1-GGUF", fileHint: "Q4_K_M" },
  "phi3:3.8b": { repo: "bartowski/Phi-3.5-mini-instruct-GGUF", fileHint: "Q4_K_M" },
  "gemma2:9b": { repo: "bartowski/gemma-2-9b-it-GGUF", fileHint: "Q4_K_M" },
  "nomic-embed": { repo: "nomic-ai/nomic-embed-text-v1.5-GGUF", fileHint: "Q8_0" }
};

export function normalizeName(value) {
  return value.trim().toLowerCase();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function resolveModelSpec(input) {
  const clean = input.trim();
  const alias = MODEL_ALIASES[normalizeName(clean)];
  if (alias) {
    return {
      requested: clean,
      alias: normalizeName(clean),
      repo: alias.repo,
      fileHint: alias.fileHint,
      localName: normalizeName(clean).replace(/[:.]/g, "-")
    };
  }

  const parts = clean.split("/");
  if (parts.length >= 3) {
    const repo = `${parts[0]}/${parts[1]}`;
    const fileHint = parts.slice(2).join("/");
    return {
      requested: clean,
      alias: null,
      repo,
      fileHint,
      localName: slugify(`${parts[1]}-${fileHint}`)
    };
  }

  if (parts.length === 2) {
    return {
      requested: clean,
      alias: null,
      repo: clean,
      fileHint: null,
      localName: slugify(parts[1])
    };
  }

  return {
    requested: clean,
    alias: null,
    repo: clean,
    fileHint: null,
    localName: slugify(clean)
  };
}
