export function optimizeForModel({ hardware, modelMetadata }) {
  const physicalCores = hardware?.cpu?.physicalCores || 4;
  const freeMem = hardware?.memory?.free || 8 * 1024 * 1024 * 1024;
  const totalVramMb = hardware?.totalVramMb || 0;
  const modelBytes = modelMetadata?.size || 4 * 1024 * 1024 * 1024;
  const modelGb = modelBytes / (1024 * 1024 * 1024);

  let gpuLayers = 0;
  if (totalVramMb > 0) {
    const estimatedLayers = Math.floor((totalVramMb / 1024) / Math.max(modelGb / 2, 1) * 8);
    gpuLayers = Math.max(0, Math.min(estimatedLayers, 120));
  }

  const threads = Math.max(1, Math.min(physicalCores, 16));
  const batchSize = freeMem > 16 * 1024 * 1024 * 1024 ? 1024 : 512;
  const flashAttention = totalVramMb >= 8192;

  return {
    threads,
    batchSize,
    gpuLayers,
    flashAttention,
    contextSize: 4096
  };
}
