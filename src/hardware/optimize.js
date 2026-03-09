import { getProfile } from "gpu-orchestrator/src/lib/profiles.js";

export function optimizeForModel({ hardware, modelMetadata }) {
  const physicalCores = hardware?.cpu?.physicalCores || 4;
  const cpuMathCores = hardware?.cpu?.mathCores || physicalCores;
  const freeMem = hardware?.memory?.free || 8 * 1024 * 1024 * 1024;
  const totalVramMb = hardware?.totalVramMb || 0;
  const freeVramMb = hardware?.freeVramMb || totalVramMb;
  const supportsGpuOffloading = hardware?.llama?.supportsGpuOffloading === true;
  const modelBytes = modelMetadata?.size || 4 * 1024 * 1024 * 1024;
  const modelGb = modelBytes / (1024 * 1024 * 1024);

  // Use gpu-orchestrator's recommended profile if available
  const profileName = hardware?.orchestrator?.recommendedProfile || "balanced";
  const profile = getProfile(profileName);

  // Use VRAM soft caps from orchestrator if available
  const vramCaps = hardware?.orchestrator?.vramCaps || [];
  const primaryCap = vramCaps
    .filter((c) => c.softCapGb > 0)
    .sort((a, b) => b.softCapGb - a.softCapGb)[0];
  const effectiveFreeVramMb = primaryCap
    ? Math.round(primaryCap.softCapGb * 1024)
    : freeVramMb;

  let gpuLayers = 0;
  if (supportsGpuOffloading && effectiveFreeVramMb > 0) {
    const usableVramGb = Math.max((effectiveFreeVramMb * 0.75) / 1024, 0);
    const estimatedLayers = Math.floor((usableVramGb / Math.max(modelGb, 1)) * 48);
    gpuLayers = Math.max(0, Math.min(estimatedLayers, 120));
  }

  // Thread count informed by profile hint
  let threads;
  const logicalCores = hardware?.cpu?.logicalCores || physicalCores * 2;
  switch (profile.numThreadHint) {
    case "all-logical-cores":
      threads = Math.max(1, Math.min(logicalCores, 32));
      break;
    case "physical-cores-minus-1":
      threads = Math.max(1, Math.min(physicalCores - 1, 16));
      break;
    case "half-logical-cores":
      threads = Math.max(1, Math.min(Math.floor(logicalCores / 2), 12));
      break;
    case "physical-cores":
    default:
      threads = Math.max(1, Math.min(cpuMathCores, 16));
      break;
  }

  // Batch size from profile
  const batchSize = profile.numBatch || (freeMem >= 24 * 1024 * 1024 * 1024 ? 2048 : freeMem >= 12 * 1024 * 1024 * 1024 ? 1024 : 512);
  const flashAttention = supportsGpuOffloading && totalVramMb >= 6144;
  const contextSize = freeMem >= 24 * 1024 * 1024 * 1024 ? 8192 : 4096;

  return {
    threads,
    batchSize,
    gpuLayers,
    flashAttention,
    contextSize,
    profile: profileName
  };
}
