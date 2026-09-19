const TOKEN_URL = "https://accounts.zoho.eu/oauth/v2/token";
const MAIL_URL = "https://mail.zoho.eu/api/accounts";
const DEFAULT_TIMEOUT_MS = 8_000;

function requestWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.resolve()
    .then(() => fetchImpl(url, { ...options, signal: controller.signal }))
    .finally(() => clearTimeout(timer));
}

function isAuthenticationFailure(response) {
  return response.status === 401 || response.status === 403;
}

export function createZohoMailer({
  clientId,
  clientSecret,
  refreshToken,
  accountId,
  fromAddress,
  toAddress,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  tokenTimeoutMs = DEFAULT_TIMEOUT_MS,
  sendTimeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let accessToken;
  let accessTokenExpiresAt = 0;

  function invalidateAccessToken() {
    accessToken = undefined;
    accessTokenExpiresAt = 0;
  }

  async function getAccessToken() {
    if (accessToken && now() < accessTokenExpiresAt) return accessToken;

    let response;
    try {
      response = await requestWithTimeout(fetchImpl, TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      }, tokenTimeoutMs);
    } catch {
      throw new Error("zoho_token_failed");
    }

    if (!response.ok) throw new Error("zoho_token_failed");
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("zoho_token_failed");
    }
    if (typeof payload?.access_token !== "string" || payload.access_token.length === 0) {
      throw new Error("zoho_token_failed");
    }

    const expiresIn = Number(payload.expires_in);
    const lifetime = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 300_000;
    accessToken = payload.access_token;
    accessTokenExpiresAt = now() + Math.max(1_000, lifetime - 30_000);
    return accessToken;
  }

  function messagePayload(mail) {
    return {
      fromAddress,
      toAddress,
      subject: mail.subject,
      content: mail.html,
      mailFormat: "html",
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    };
  }

  async function sendOnce(mail, token) {
    const response = await requestWithTimeout(fetchImpl, `${MAIL_URL}/${encodeURIComponent(accountId)}/messages`, {
      method: "POST",
      headers: {
        authorization: `Zoho-oauthtoken ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(messagePayload(mail)),
    }, sendTimeoutMs);
    return response;
  }

  return {
    async sendMail(mail) {
      let token = await getAccessToken();
      let response;
      try {
        response = await sendOnce(mail, token);
      } catch {
        throw new Error("zoho_send_failed");
      }

      if (isAuthenticationFailure(response)) {
        invalidateAccessToken();
        token = await getAccessToken();
        try {
          response = await sendOnce(mail, token);
        } catch {
          throw new Error("zoho_send_failed");
        }
      }

      if (!response.ok) throw new Error("zoho_send_failed");
      return { accepted: [toAddress] };
    },
  };
}
