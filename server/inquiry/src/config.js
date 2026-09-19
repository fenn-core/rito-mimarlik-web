function positiveInteger(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`invalid_config:${name}`);
  return parsed;
}

function allowedOrigins(env) {
  const configured = env.INQUIRY_ALLOWED_ORIGINS !== undefined
    ? env.INQUIRY_ALLOWED_ORIGINS
    : env.INQUIRY_ALLOWED_ORIGIN ?? "https://ritomimarlik.com";
  const origins = configured.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.some((origin) => origin.includes("*"))) throw new Error("invalid_config:INQUIRY_ALLOWED_ORIGINS");
  return origins;
}

export function loadConfig(env = process.env) {
  const required = [
    "ZOHO_CLIENT_ID",
    "ZOHO_CLIENT_SECRET",
    "ZOHO_REFRESH_TOKEN",
    "ZOHO_ACCOUNT_ID",
    "ZOHO_FROM",
    "INQUIRY_TO",
  ];
  for (const name of required) if (!env[name]) throw new Error(`missing_config:${name}`);
  const host = env.INQUIRY_HOST || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("invalid_config:INQUIRY_HOST");
  if (env.ZOHO_FROM !== "webform@ritomimarlik.com") throw new Error("invalid_config:ZOHO_FROM");
  if (env.INQUIRY_TO !== "proje@ritomimarlik.com") throw new Error("invalid_config:INQUIRY_TO");
  return {
    host,
    port: positiveInteger(env.INQUIRY_PORT, 8787, "INQUIRY_PORT"),
    allowedOrigins: allowedOrigins(env),
    bodyLimit: positiveInteger(env.INQUIRY_BODY_LIMIT, 24 * 1024, "INQUIRY_BODY_LIMIT"),
    rateLimitMax: positiveInteger(env.INQUIRY_RATE_LIMIT_MAX, 5, "INQUIRY_RATE_LIMIT_MAX"),
    rateLimitWindowMs: positiveInteger(env.INQUIRY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "INQUIRY_RATE_LIMIT_WINDOW_MS"),
    zoho: {
      clientId: env.ZOHO_CLIENT_ID,
      clientSecret: env.ZOHO_CLIENT_SECRET,
      refreshToken: env.ZOHO_REFRESH_TOKEN,
      accountId: env.ZOHO_ACCOUNT_ID,
      fromAddress: env.ZOHO_FROM,
    },
    inquiryTo: env.INQUIRY_TO,
  };
}
