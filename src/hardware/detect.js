import os from "node:os";
import { getSystemSnapshot, detectVendors } from "gpu-orchestrator/src/lib/system.js";
import { computeVramCaps } from "gpu-orchestrator/src/lib/vram.js";
import { detectBackends, recommendBackend } from "gpu-orchestrator/src/lib/backends.js";
import { recommendByHardware } from "gpu-orchestrator/src/lib/profiles.js";
import { getLlamaInstance } from "../engine/loader.js";

async function detectLlamaRuntime() {
  try {
    const llama = await getLlamaInstance();
    const [vramStateResult, gpuNamesResult] = await Promise.allSettled([
      llama.getVramState(),
      llama.getGpuDeviceNames()
    ]);

    return {
      backend: llama.gpu || false,
      supportsGpuOffloading: Boolean(llama.supportsGpuOffloading),
      cpuMathCores: llama.cpuMathCores || null,
      gpuDeviceNames: gpuNamesResult.status === "fulfilled" ? gpuNamesResult.value : [],
      vram: vramStateResult.status === "fulfilled" ? vramStateResult.value : null
    };
  } catch {
    return {
      backend: false,
      supportsGpuOffloading: false,
      cpuMathCores: null,
      gpuDeviceNames: [],
      vram: null
    };
  }
}

export async function detectHardware() {
  // Use gpu-orchestrator for comprehensive system snapshot
  const [snapshot, llamaRuntime] = await Promise.all([
    getSystemSnapshot(),
    detectLlamaRuntime()
  ]);

  const cpu = snapshot.cpu;
  const mem = snapshot.mem;
  const osInfo = snapshot.osInfo;

  const gpus = (snapshot.graphics?.controllers || []).map((gpu) => ({
    vendor: gpu.vendor || "unknown",
    model: gpu.model || "unknown",
    vramMb: gpu.vram || 0,
    bus: gpu.bus || "unknown"
  }));

  const totalVramMbFromSystem = gpus.reduce((sum, gpu) => sum + (gpu.vramMb || 0), 0);
  const totalVramMbFromLlama = llamaRuntime.vram ? Math.round(llamaRuntime.vram.total / (1024 * 1024)) : 0;
  const freeVramMbFromLlama = llamaRuntime.vram ? Math.round(llamaRuntime.vram.free / (1024 * 1024)) : 0;
  const totalVramMb = Math.max(totalVramMbFromSystem, totalVramMbFromLlama);
  const cpuMathCores = llamaRuntime.cpuMathCores || cpu.physicalCores || Math.max(Math.floor(os.cpus().length / 2), 1);

  // gpu-orchestrator enrichments
  const vendors = detectVendors(snapshot);
  const backends = detectBackends(snapshot);
  const backendRecommendation = recommendBackend(snapshot, backends);
  const vramCaps = computeVramCaps({ snapshot, policy: "balanced" });
  const recommendedProfile = recommendByHardware({
    vendors,
    totalMemGb: Math.round(mem.total / (1024 * 1024 * 1024)),
    vramGb: Math.round(totalVramMb / 1024),
    coreCount: cpu.physicalCores || Math.max(Math.floor(os.cpus().length / 2), 1)
  });

  return {
    platform: osInfo.platform,
    distro: osInfo.distro,
    arch: os.arch(),
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores || Math.max(Math.floor(os.cpus().length / 2), 1),
      logicalCores: cpu.cores || os.cpus().length,
      mathCores: cpuMathCores
    },
    memory: {
      total: mem.total,
      free: mem.available
    },
    gpus,
    totalVramMb,
    freeVramMb: freeVramMbFromLlama,
    hasGpu: gpus.length > 0 || llamaRuntime.backend !== false,
    llama: llamaRuntime,
    // gpu-orchestrator enrichments
    orchestrator: {
      vendors,
      backends,
      backendRecommendation,
      vramCaps,
      recommendedProfile
    }
  };
}
