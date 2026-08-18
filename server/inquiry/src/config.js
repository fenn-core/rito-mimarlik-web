function positiveInteger(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`invalid_config:${name}`);
  return parsed;
}

function boolean(value, fallback, name) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`invalid_config:${name}`);
}

export function loadConfig(env = process.env) {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "INQUIRY_TO"];
  for (const name of required) if (!env[name]) throw new Error(`missing_config:${name}`);
  const host = env.INQUIRY_HOST || "127.0.0.1";
  const secure = boolean(env.SMTP_SECURE, true, "SMTP_SECURE");
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("invalid_config:INQUIRY_HOST");
  if (!secure) throw new Error("invalid_config:SMTP_SECURE");
  if (env.SMTP_USER !== "webform@ritomimarlik.com") throw new Error("invalid_config:SMTP_USER");
  if (env.INQUIRY_TO !== "proje@ritomimarlik.com") throw new Error("invalid_config:INQUIRY_TO");
  return {
    host,
    port: positiveInteger(env.INQUIRY_PORT, 8787, "INQUIRY_PORT"),
    allowedOrigin: env.INQUIRY_ALLOWED_ORIGIN || "https://ritomimarlik.com",
    bodyLimit: positiveInteger(env.INQUIRY_BODY_LIMIT, 24 * 1024, "INQUIRY_BODY_LIMIT"),
    rateLimitMax: positiveInteger(env.INQUIRY_RATE_LIMIT_MAX, 5, "INQUIRY_RATE_LIMIT_MAX"),
    rateLimitWindowMs: positiveInteger(env.INQUIRY_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, "INQUIRY_RATE_LIMIT_WINDOW_MS"),
    smtp: {
      host: env.SMTP_HOST,
      port: positiveInteger(env.SMTP_PORT, 465, "SMTP_PORT"),
      secure,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    },
    inquiryTo: env.INQUIRY_TO,
  };
}
