import assert from "node:assert/strict";
import test from "node:test";
import { buildMail, escapeHtml } from "../src/email.js";
import { loadConfig } from "../src/config.js";
import { validateSubmission } from "../src/schema.js";
import { createInquiryServer } from "../src/service.js";

const baseConfig = {
  allowedOrigin: "https://ritomimarlik.com",
  bodyLimit: 24 * 1024,
  rateLimitMax: 5,
  rateLimitWindowMs: 60_000,
  smtp: { user: "webform@ritomimarlik.com" },
  inquiryTo: "proje@ritomimarlik.com",
};

function validSubmission(overrides = {}) {
  return {
    "customer-type": "business",
    "full-name": "Ada Örnek",
    email: "ada@example.org",
    phone: "+90 555 111 22 33",
    "contact-method": "email",
    "company-name": "Örnek Kurum",
    "company-role": "Proje Yöneticisi",
    "requested-service": "project-development",
    "project-type": "corporate",
    address: "İstanbul",
    message: "Proje kapsamı hakkında görüşmek istiyoruz.",
    "kvkk-consent": true,
    website: "",
    ...overrides,
  };
}

async function withServer(options, callback) {
  const logs = [];
  const mailer = options.mailer || { sendMail: async () => ({ accepted: [baseConfig.inquiryTo] }) };
  const server = createInquiryServer({
    config: { ...baseConfig, ...options.config },
    mailer,
    logger: { info: (entry) => logs.push(entry) },
    now: options.now || (() => Date.parse("2026-08-18T12:00:00.000Z")),
    idFactory: options.idFactory || (() => "ref-test"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await callback({ url: `http://127.0.0.1:${port}`, mailer, logs });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(url, body, headers = {}) {
  return fetch(`${url}/api/inquiry`, {
    method: "POST",
    headers: { origin: baseConfig.allowedOrigin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("valid submission is normalized and accepted", () => {
  const result = validateSubmission(validSubmission({ "full-name": "  Ada Örnek  " }));
  assert.equal(result.ok, true);
  assert.equal(result.value["full-name"], "Ada Örnek");
});

test("production configuration enforces loopback, fixed mailboxes, and implicit TLS", () => {
  const env = {
    SMTP_HOST: "smtp.zoho.eu",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "webform@ritomimarlik.com",
    SMTP_PASSWORD: "test-only",
    INQUIRY_TO: "proje@ritomimarlik.com",
  };
  assert.equal(loadConfig(env).host, "127.0.0.1");
  assert.throws(() => loadConfig({ ...env, INQUIRY_HOST: "0.0.0.0" }), /INQUIRY_HOST/);
  assert.throws(() => loadConfig({ ...env, SMTP_SECURE: "false" }), /SMTP_SECURE/);
  assert.throws(() => loadConfig({ ...env, SMTP_HOST: "smtp.zoho.com" }), /SMTP_HOST/);
  assert.throws(() => loadConfig({ ...env, SMTP_USER: "personal@example.org" }), /SMTP_USER/);
  assert.throws(() => loadConfig({ ...env, INQUIRY_TO: "other@example.org" }), /INQUIRY_TO/);
});

test("required fields are reported without submitted values", () => {
  const result = validateSubmission({});
  assert.equal(result.ok, false);
  assert.ok(result.fields.includes("full-name"));
  assert.ok(result.fields.includes("message"));
  assert.equal(JSON.stringify(result).includes("Ada"), false);
});

test("invalid enums and unknown fields are rejected", () => {
  const result = validateSubmission(validSubmission({ "project-type": "invented", admin: true }));
  assert.deepEqual(result.fields.filter((field) => ["project-type", "admin"].includes(field)), ["admin", "project-type"]);
});

test("malformed email is rejected", () => {
  const result = validateSubmission(validSubmission({ email: "not-an-email" }));
  assert.ok(result.fields.includes("email"));
});

test("conditional business and preferred-phone rules are enforced", () => {
  assert.ok(validateSubmission(validSubmission({ "company-name": "" })).fields.includes("company-name"));
  assert.ok(validateSubmission(validSubmission({ "contact-method": "phone", phone: "" })).fields.includes("phone"));
  const individual = validSubmission({ "customer-type": "individual", "company-name": "", "company-role": "" });
  assert.equal(validateSubmission(individual).ok, true);
});

test("single-line header/control character abuse is rejected", () => {
  const result = validateSubmission(validSubmission({ email: "ada@example.org\r\nBcc:evil@example.org" }));
  assert.ok(result.fields.includes("email"));
});

test("HTML output escapes every supplied value and text output preserves lines", () => {
  assert.equal(escapeHtml("<script>&\"'"), "&lt;script&gt;&amp;&quot;&#39;");
  const data = validSubmission({ message: "Birinci satır\n<script>alert(1)</script>" });
  const mail = buildMail({ data, reference: "ref-1", timestamp: "2026-08-18T12:00:00.000Z", fromAddress: baseConfig.smtp.user, toAddress: baseConfig.inquiryTo });
  assert.equal(mail.html.includes("<script>alert(1)</script>"), false);
  assert.ok(mail.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(mail.text.includes("Birinci satır\n<script>alert(1)</script>"));
});

test("Reply-To is present only when an email is supplied", () => {
  const args = { reference: "ref", timestamp: "now", fromAddress: baseConfig.smtp.user, toAddress: baseConfig.inquiryTo };
  assert.equal(buildMail({ ...args, data: validSubmission() }).replyTo, "ada@example.org");
  assert.equal("replyTo" in buildMail({ ...args, data: validSubmission({ email: "" }) }), false);
});

test("wrong content type returns 415", async () => {
  await withServer({}, async ({ url }) => {
    const response = await post(url, "x", { "content-type": "text/plain" });
    assert.equal(response.status, 415);
    assert.equal((await response.json()).code, "unsupported_media_type");
  });
});

test("oversized body returns 413", async () => {
  await withServer({ config: { bodyLimit: 128 } }, async ({ url }) => {
    const response = await post(url, validSubmission({ message: "x".repeat(300) }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, "payload_too_large");
  });
});

test("Origin mismatch is rejected before delivery", async () => {
  let calls = 0;
  await withServer({ mailer: { sendMail: async () => { calls += 1; return { accepted: [baseConfig.inquiryTo] }; } } }, async ({ url }) => {
    const response = await post(url, validSubmission(), { origin: "https://evil.example" });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  });
});

test("honeypot receives generic success but never triggers SMTP", async () => {
  let calls = 0;
  await withServer({ mailer: { sendMail: async () => { calls += 1; } } }, async ({ url }) => {
    const response = await post(url, validSubmission({ website: "https://bot.example" }));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).ok, true);
    assert.equal(calls, 0);
  });
});

test("in-memory rate limit returns 429", async () => {
  await withServer({ config: { rateLimitMax: 1 } }, async ({ url }) => {
    assert.equal((await post(url, validSubmission())).status, 202);
    const response = await post(url, validSubmission());
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "rate_limited");
  });
});

test("SMTP failure maps to delivery_unavailable without leaking diagnostics", async () => {
  await withServer({ mailer: { sendMail: async () => { throw new Error("secret provider diagnostic"); } } }, async ({ url, logs }) => {
    const response = await post(url, validSubmission());
    const raw = await response.text();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(raw), { ok: false, code: "delivery_unavailable" });
    assert.equal(raw.includes("secret provider"), false);
    assert.equal(JSON.stringify(logs).includes("ada@example.org"), false);
  });
});

test("success requires SMTP acceptance of the configured destination", async () => {
  await withServer({ mailer: { sendMail: async () => ({ accepted: ["other@example.org"] }) } }, async ({ url }) => {
    assert.equal((await post(url, validSubmission())).status, 503);
  });
  let captured;
  await withServer({ mailer: { sendMail: async (mail) => { captured = mail; return { accepted: [baseConfig.inquiryTo] }; } } }, async ({ url }) => {
    const response = await post(url, validSubmission());
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, reference: "ref-test" });
    assert.equal(captured.from.address, "webform@ritomimarlik.com");
    assert.equal(captured.to, "proje@ritomimarlik.com");
  });
});

test("validation response and operational logs never reflect submitted values", async () => {
  await withServer({}, async ({ url, logs }) => {
    const response = await post(url, validSubmission({ email: "private-value", message: "Confidential project body" }));
    const raw = await response.text();
    assert.equal(response.status, 400);
    assert.equal(raw.includes("private-value"), false);
    assert.equal(JSON.stringify(logs).includes("Confidential project body"), false);
  });
});

test("health endpoint discloses service health only", async () => {
  await withServer({}, async ({ url }) => {
    const response = await fetch(`${url}/health`);
    assert.deepEqual(await response.json(), { ok: true });
  });
});
