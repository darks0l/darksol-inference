import os from "node:os";
import si from "systeminformation";
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
  const [cpu, mem, graphics, osInfo, llamaRuntime] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.osInfo(),
    detectLlamaRuntime()
  ]);

  const gpus = (graphics.controllers || []).map((gpu) => ({
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
    llama: llamaRuntime
  };
}
