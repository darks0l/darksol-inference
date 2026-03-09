function normalizeBaseUrl(baseUrl = "") {
  return String(baseUrl || "http://127.0.0.1:18790").replace(/\/+$/, "");
}

function buildAuthHeader(token) {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) return {};
  return { authorization: `Bearer ${trimmed}` };
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class WalletSignerClient {
  constructor({ baseUrl = "http://127.0.0.1:18790", token = null, fetchImpl = fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...buildAuthHeader(this.token)
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await parseJsonSafe(response);

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `Wallet signer request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.error?.code || "wallet_signer_error";
      throw error;
    }

    return payload || {};
  }

  async getAddress() {
    return this.request("/address");
  }

  async getBalance() {
    return this.request("/balance");
  }

  async getPolicy() {
    return this.request("/policy");
  }

  async sendTransaction(payload) {
    return this.request("/send", { method: "POST", body: payload || {} });
  }

  async signMessage(payload) {
    return this.request("/sign-message", { method: "POST", body: payload || {} });
  }

  async signTypedData(payload) {
    return this.request("/sign-typed-data", { method: "POST", body: payload || {} });
  }
}

export function createWalletSignerClient(options = {}) {
  return new WalletSignerClient(options);
}
