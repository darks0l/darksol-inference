import net from "node:net";

function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n > 0 && n <= 65535;
}

export async function isPortAvailable(port, host = "127.0.0.1") {
  if (!isValidPort(port)) {
    return { port: Number(port), available: false, error: "invalid_port" };
  }

  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve({ port: Number(port), available: false });
    });

    server.once("listening", () => {
      server.close(() => resolve({ port: Number(port), available: true }));
    });

    server.listen(Number(port), host);
  });
}

export async function findAvailablePort({ startPort = 11435, host = "127.0.0.1", maxAttempts = 50 } = {}) {
  let current = Number(startPort);
  for (let i = 0; i < maxAttempts; i += 1) {
    const check = await isPortAvailable(current, host);
    if (check.available) {
      return check.port;
    }
    current += 1;
  }
  throw new Error(`No free port found from ${startPort} after ${maxAttempts} attempts.`);
}

export { isValidPort };
