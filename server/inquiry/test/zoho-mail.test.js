import assert from "node:assert/strict";
import test from "node:test";
import { createZohoMailer } from "../src/zoho-mail.js";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  accountId: "account-id",
  fromAddress: "webform@ritomimarlik.com",
  toAddress: "proje@ritomimarlik.com",
};

const mail = {
  from: { address: "browser-controlled@example.org" },
  to: "attacker@example.org",
  replyTo: "visitor@example.org",
  subject: "Yeni proje talebi",
  html: "<p>İçerik</p>",
};

function response(status, body = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function tokenBody() {
  return new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  }).toString();
}

test("refreshes a token and sends the fixed sender/recipient through Zoho", async () => {
  const calls = [];
  const mailer = createZohoMailer({
    ...config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? response(200, { access_token: "access-1", expires_in: 3600 }) : response(200, { data: { messageId: "m-1" } });
    },
  });

  assert.deepEqual(await mailer.sendMail(mail), { accepted: [config.toAddress] });
  assert.equal(calls[0].url, "https://accounts.zoho.eu/oauth/v2/token");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(calls[0].options.body.toString(), tokenBody());
  assert.equal(calls[1].url, "https://mail.zoho.eu/api/accounts/account-id/messages");
  assert.equal(calls[1].options.headers.authorization, "Zoho-oauthtoken access-1");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    fromAddress: config.fromAddress,
    toAddress: config.toAddress,
    subject: mail.subject,
    content: mail.html,
    mailFormat: "html",
    replyTo: mail.replyTo,
  });
});

test("caches an unexpired access token", async () => {
  let tokenCalls = 0;
  let sendCalls = 0;
  const mailer = createZohoMailer({
    ...config,
    fetchImpl: async (url) => {
      if (url.includes("oauth")) {
        tokenCalls += 1;
        return response(200, { access_token: "access-1", expires_in: 3600 });
      }
      sendCalls += 1;
      return response(200);
    },
  });
  await mailer.sendMail(mail);
  await mailer.sendMail(mail);
  assert.equal(tokenCalls, 1);
  assert.equal(sendCalls, 2);
});

test("refreshes an expired access token", async () => {
  let clock = 0;
  let tokenCalls = 0;
  const mailer = createZohoMailer({
    ...config,
    now: () => clock,
    fetchImpl: async (url) => {
      if (url.includes("oauth")) {
        tokenCalls += 1;
        return response(200, { access_token: `access-${tokenCalls}`, expires_in: 40 });
      }
      return response(200);
    },
  });
  await mailer.sendMail(mail);
  clock = 11_000;
  await mailer.sendMail(mail);
  assert.equal(tokenCalls, 2);
});

test("invalidates and refreshes once after an authentication failure", async () => {
  const calls = [];
  const mailer = createZohoMailer({
    ...config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("oauth")) return response(200, { access_token: `access-${calls.length}`, expires_in: 3600 });
      return calls.length === 2 ? response(401, { error: "sensitive provider detail" }) : response(200);
    },
  });
  await mailer.sendMail(mail);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].options.headers.authorization, "Zoho-oauthtoken access-3");
});

test("maps token and send failures to sanitized errors", async () => {
  const tokenFailure = createZohoMailer({ ...config, fetchImpl: async () => response(500, { error: "refresh-token-secret" }) });
  await assert.rejects(tokenFailure.sendMail(mail), (error) => {
    assert.equal(error.message, "zoho_token_failed");
    assert.equal(error.message.includes("refresh-token-secret"), false);
    return true;
  });

  let send = false;
  const sendFailure = createZohoMailer({
    ...config,
    fetchImpl: async (url) => {
      if (url.includes("oauth")) return response(200, { access_token: "access-1", expires_in: 3600 });
      send = true;
      return response(500, { error: "provider-secret" });
    },
  });
  await assert.rejects(sendFailure.sendMail(mail), /zoho_send_failed/);
  assert.equal(send, true);
});

test("aborts a token operation at its timeout", async () => {
  const mailer = createZohoMailer({
    ...config,
    tokenTimeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  await assert.rejects(mailer.sendMail(mail), /zoho_token_failed/);
});
