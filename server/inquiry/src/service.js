import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { buildMail } from "./email.js";
import { validateSubmission } from "./schema.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function respond(response, status, body) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function clientKey(request) {
  const peer = request.socket.remoteAddress || "unknown";
  if (!isLoopback(peer)) return peer;
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded !== "string") return peer;
  const first = forwarded.split(",", 1)[0].trim();
  return isIP(first) ? first : peer;
}

function createRateLimiter({ maximum, windowMs, now }) {
  const entries = new Map();
  return {
    consume(key) {
      const current = now();
      for (const [storedKey, entry] of entries) {
        if (current - entry.startedAt >= windowMs) entries.delete(storedKey);
      }
      const existing = entries.get(key);
      if (!existing || current - existing.startedAt >= windowMs) {
        entries.set(key, { startedAt: current, count: 1 });
        return true;
      }
      existing.count += 1;
      return existing.count <= maximum;
    },
  };
}

async function readJson(request, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("payload_too_large");
      error.code = "payload_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid_json");
    error.code = "invalid_json";
    throw error;
  }
}

function acceptedDestination(info, destination) {
  return Array.isArray(info?.accepted) && info.accepted.some(
    (address) => String(address).toLowerCase() === destination.toLowerCase(),
  );
}

export function createInquiryServer({
  config,
  mailer,
  logger = console,
  now = () => Date.now(),
  idFactory = () => randomUUID(),
}) {
  const limiter = createRateLimiter({ maximum: config.rateLimitMax, windowMs: config.rateLimitWindowMs, now });

  function operationalLog(category, reference, extra = {}) {
    logger.info?.({ timestamp: new Date(now()).toISOString(), reference, category, ...extra });
  }

  return createServer(async (request, response) => {
    const reference = idFactory();
    const url = new URL(request.url || "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      respond(response, 200, { ok: true });
      return;
    }
    if (url.pathname !== "/api/inquiry") {
      respond(response, 404, { ok: false, code: "not_found" });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      respond(response, 405, { ok: false, code: "method_not_allowed" });
      return;
    }
    if (request.headers.origin !== config.allowedOrigin) {
      operationalLog("origin_rejected", reference);
      respond(response, 403, { ok: false, code: "origin_not_allowed" });
      return;
    }
    const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      operationalLog("unsupported_media_type", reference);
      respond(response, 415, { ok: false, code: "unsupported_media_type" });
      return;
    }
    if (!limiter.consume(clientKey(request))) {
      operationalLog("rate_limited", reference);
      respond(response, 429, { ok: false, code: "rate_limited" });
      return;
    }

    let body;
    try {
      body = await readJson(request, config.bodyLimit);
    } catch (error) {
      const tooLarge = error.code === "payload_too_large";
      operationalLog(tooLarge ? "payload_too_large" : "invalid_json", reference);
      respond(response, tooLarge ? 413 : 400, { ok: false, code: tooLarge ? "payload_too_large" : "invalid_submission", ...(tooLarge ? {} : { fields: ["submission"] }) });
      return;
    }

    const result = validateSubmission(body);
    if (!result.ok) {
      operationalLog("validation_failed", reference, { invalidFieldCount: result.fields.length });
      respond(response, 400, { ok: false, code: "invalid_submission", fields: result.fields });
      return;
    }
    if (result.honeypot) {
      operationalLog("honeypot_discarded", reference);
      respond(response, 202, { ok: true, reference });
      return;
    }

    const timestamp = new Date(now()).toISOString();
    const mail = buildMail({
      data: result.value,
      reference,
      timestamp,
      fromAddress: config.smtp.user,
      toAddress: config.inquiryTo,
    });
    try {
      const info = await mailer.sendMail(mail);
      if (!acceptedDestination(info, config.inquiryTo)) throw new Error("destination_not_accepted");
      operationalLog("smtp_accepted", reference);
      respond(response, 202, { ok: true, reference });
    } catch {
      operationalLog("smtp_failed", reference);
      respond(response, 503, { ok: false, code: "delivery_unavailable" });
    }
  });
}
