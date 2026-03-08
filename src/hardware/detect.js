import os from "node:os";
import si from "systeminformation";

export async function detectHardware() {
  const [cpu, mem, graphics, osInfo] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.osInfo()
  ]);

  const gpus = (graphics.controllers || []).map((gpu) => ({
    vendor: gpu.vendor || "unknown",
    model: gpu.model || "unknown",
    vramMb: gpu.vram || 0,
    bus: gpu.bus || "unknown"
  }));

  const totalVramMb = gpus.reduce((sum, gpu) => sum + (gpu.vramMb || 0), 0);

  return {
    platform: osInfo.platform,
    distro: osInfo.distro,
    arch: os.arch(),
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores || Math.max(Math.floor(os.cpus().length / 2), 1),
      logicalCores: cpu.cores || os.cpus().length
    },
    memory: {
      total: mem.total,
      free: mem.available
    },
    gpus,
    totalVramMb,
    hasGpu: gpus.length > 0
  };
}
