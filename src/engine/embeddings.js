export async function createEmbedding({ model, input }) {
  const embeddingContext = await model.createEmbeddingContext();
  const result = await embeddingContext.getEmbeddingFor(input);
  return result.vector || result.embedding || result;
}
