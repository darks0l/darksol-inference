import si from "systeminformation";

export async function getThermalStatus() {
  try {
    const temp = await si.cpuTemperature();
    return {
      main: temp.main || null,
      cores: temp.cores || [],
      max: temp.max || null
    };
  } catch {
    return {
      main: null,
      cores: [],
      max: null
    };
  }
}
