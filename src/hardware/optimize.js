export function optimizeForModel({ hardware, modelMetadata }) {
  const physicalCores = hardware?.cpu?.physicalCores || 4;
  const cpuMathCores = hardware?.cpu?.mathCores || physicalCores;
  const freeMem = hardware?.memory?.free || 8 * 1024 * 1024 * 1024;
  const totalVramMb = hardware?.totalVramMb || 0;
  const freeVramMb = hardware?.freeVramMb || totalVramMb;
  const supportsGpuOffloading = hardware?.llama?.supportsGpuOffloading === true;
  const modelBytes = modelMetadata?.size || 4 * 1024 * 1024 * 1024;
  const modelGb = modelBytes / (1024 * 1024 * 1024);

  let gpuLayers = 0;
  if (supportsGpuOffloading && freeVramMb > 0) {
    const usableVramGb = Math.max((freeVramMb * 0.75) / 1024, 0);
    const estimatedLayers = Math.floor((usableVramGb / Math.max(modelGb, 1)) * 48);
    gpuLayers = Math.max(0, Math.min(estimatedLayers, 120));
  }

  const threads = Math.max(1, Math.min(cpuMathCores, 16));
  const batchSize = freeMem >= 24 * 1024 * 1024 * 1024 ? 2048 : freeMem >= 12 * 1024 * 1024 * 1024 ? 1024 : 512;
  const flashAttention = supportsGpuOffloading && totalVramMb >= 6144;
  const contextSize = freeMem >= 24 * 1024 * 1024 * 1024 ? 8192 : 4096;

  return {
    threads,
    batchSize,
    gpuLayers,
    flashAttention,
    contextSize
  };
}
