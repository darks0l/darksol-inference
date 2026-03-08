function asBool(value) {
  return value === "1" || value === "true";
}

export function createBankrClientFromEnv(env = process.env) {
  const baseUrl = env.BANKR_BASE_URL || null;
  const apiKey = env.BANKR_API_KEY || null;
  const sandbox = env.BANKR_SANDBOX ? asBool(env.BANKR_SANDBOX) : true;
  const configured = Boolean(baseUrl && apiKey);

  return {
    isConfigured() {
      return configured;
    },
    getHealthStatus() {
      return {
        provider: "bankr",
        configured,
        sandbox,
        baseUrlConfigured: Boolean(baseUrl)
      };
    }
  };
}
