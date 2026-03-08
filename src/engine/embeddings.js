function normalizeEmbeddingVector(result) {
  const vector = result?.vector || result?.embedding || result;
  if (!Array.isArray(vector)) {
    throw new Error("Embedding model returned an invalid vector.");
  }
  return vector;
}

export async function createEmbedding({ model, input }) {
  if (!model || typeof model.createEmbeddingContext !== "function") {
    throw new Error("Selected model does not support embeddings.");
  }

  const embeddingContext = await model.createEmbeddingContext();
  const result = await embeddingContext.getEmbeddingFor(input);
  return normalizeEmbeddingVector(result);
}
