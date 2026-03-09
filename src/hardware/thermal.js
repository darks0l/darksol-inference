import { getTemperatures } from "gpu-orchestrator/src/lib/thermal.js";

export async function getThermalStatus() {
  try {
    const temps = await getTemperatures();
    return {
      main: temps.cpu?.temp || null,
      cores: [],
      max: temps.cpu?.max || null,
      gpus: temps.gpus || []
    };
  } catch {
    return {
      main: null,
      cores: [],
      max: null,
      gpus: []
    };
  }
}
