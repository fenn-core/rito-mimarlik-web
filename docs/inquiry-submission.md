# Project inquiry delivery contract

## Implemented architecture

`/contact/#project-inquiry` uses `data-submission-mode="active"`. After native browser validation, `js/quote-form.js` sends JSON to the same-origin `POST /api/inquiry` endpoint. A standalone Node service receives and validates the payload, creates plain-text and HTML email variants transiently, and submits the message through the authenticated Zoho Mail EU HTTPS API.

The Zoho API sender is `webform@ritomimarlik.com`; the only project-delivery destination is `proje@ritomimarlik.com`. The destination remains an RX/distribution address. Browser success is returned only after the API reports that destination as accepted.

There is no application database, persistent queue, local message archive, file spool, or automatic persistent retry. Normal operational logs contain only timestamp, non-sensitive reference ID, outcome category, and an invalid-field count for validation failures. They exclude inquiry values, submitted field names, client IP addresses, and OAuth credentials or access tokens. In-memory rate-limit keys expire with the process/window and are not written to logs.

## Payload fields and validation

| Field name | Public meaning | Server rule |
| --- | --- | --- |
| `customer-type` | Talep Sahibi | Required enum: `individual`, `business` |
| `full-name` | Ad Soyad | Required trimmed single line, 2–120 characters |
| `email` | E-posta Adresi | Required conservative email syntax, maximum 254 characters |
| `phone` | Telefon Numarası | Optional; required with at least 7 digits when contact method is `phone`; maximum 40 characters |
| `contact-method` | Tercih Edilen İletişim Yöntemi | Required enum: `email`, `phone` |
| `company-name` | Kurum / Şirket Adı | Required only for `business`, 2–160 characters; omitted for `individual` |
| `company-role` | Görev veya Departman | Optional for `business`, maximum 120 characters; omitted for `individual` |
| `requested-service` | Talep Edilen Hizmet | Required exact enum matching the seven public options |
| `project-type` | Proje Türü | Required exact enum matching the five public options |
| `address` | Proje Adresi veya Mevkii | Optional single line, maximum 240 characters |
| `message` | Project description | Required multiline text, 10–4000 characters |
| `kvkk-consent` | Notice-read acknowledgement | Required boolean `true`; the field name is historical and its legal semantics still require review |
| `website` | Honeypot | Must be an empty string for human delivery |

Unknown top-level fields, invalid types/enums, prohibited control characters, missing conditional values, and non-true acknowledgement values are rejected. Disabled business controls are omitted from individual requests. The backend does not trust browser validation or option labels.

## HTTP contract

- `POST /api/inquiry` accepts only `application/json`, with a default 24 KiB body limit.
- The browser `Origin` must exactly match one entry in the comma-separated `INQUIRY_ALLOWED_ORIGINS` allowlist. If it is unset, the service falls back to the legacy `INQUIRY_ALLOWED_ORIGIN`; if both are unset, the default is `https://ritomimarlik.com`. Entries are trimmed, empty entries are removed, and no wildcard or pattern matching is supported. No permissive CORS header is emitted.
- Success: `202 { "ok": true, "reference": "..." }`.
- Validation: `400 { "ok": false, "code": "invalid_submission", "fields": [...] }`.
- Unsupported body: `415 { "ok": false, "code": "unsupported_media_type" }`.
- Oversized body: `413 { "ok": false, "code": "payload_too_large" }`.
- Rate limit: `429 { "ok": false, "code": "rate_limited" }`.
- Zoho API/service failure: `503 { "ok": false, "code": "delivery_unavailable" }`.
- `GET /health` returns only `{ "ok": true }` and never sends mail.

Honeypot hits receive the same generic `202` shape as real acceptance but never invoke provider delivery. This avoids giving bots a useful detection signal.

## Zoho Mail API and message safety

Configuration comes only from the service environment; see `server/inquiry/.env.example`. Required provider variables are `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNT_ID`, `ZOHO_FROM`, and `INQUIRY_TO`; `ZOHO_FROM` and `INQUIRY_TO` remain fixed server-side addresses. The European Zoho organization uses `https://accounts.zoho.eu/oauth/v2/token` for refresh-token exchanges and `https://mail.zoho.eu/api/accounts/{accountId}/messages` for delivery. Access tokens are cached only in memory, refreshed before expiry, and retried once after an authentication failure. Both external operations have bounded timeouts, and no startup email is sent.

The service fixes From to `Rito Mimarlık Web Formu <webform@ritomimarlik.com>` and To to `proje@ritomimarlik.com`. A validated visitor email becomes Reply-To; client data cannot set From, To, CC, BCC, or arbitrary headers. Single-line controls are rejected, the bounded subject component is stripped of CR/LF defensively, and all HTML values are escaped.

## Abuse controls and proxy trust

The first-stage controls are authoritative validation, the body limit, honeypot, exact Origin enforcement, and a per-process in-memory rate limiter (default 5 attempts per 15 minutes). The service binds to `127.0.0.1` by default. It accepts the first `X-Forwarded-For` value only when the immediate TCP peer is loopback; otherwise it keys rate limiting on the peer address. nginx must replace/supply this header rather than append an untrusted public value.

## Frontend states

The UI implements IDLE, PENDING, SUCCESS, validation failure, rate-limit failure, and delivery failure. The submit control is disabled during PENDING. The form resets only after `202` provider acceptance; every failure preserves entered values. The status region announces concise Turkish results, and server field-name errors focus the first affected control where practical.

## Operations and deployment boundary

The production Node service is installed at `/opt/rito-inquiry/current`, reads its protected environment from `/etc/rito-inquiry/inquiry.env`, and runs as the enabled `rito-inquiry.service` systemd unit. It binds only to `127.0.0.1:8787`; its health endpoint remains loopback-only. The repository example unit retains the unprivileged service-account, restart-on-failure, and journal-only operational-logging model. No secret belongs in the unit or repository.

The tested production path is:

`Browser → /api/inquiry → nginx → 127.0.0.1:8787 → rito-inquiry.service → Zoho Mail HTTPS API → webform@ritomimarlik.com → proje@ritomimarlik.com`

nginx proxies only the exact `/api/inquiry` location, replaces the forwarded client-IP header with its trusted/restored `$remote_addr`, and permits same-origin Fetch with `connect-src 'self'`. The checked-in deployment template now mirrors this verified contract. Static staging still excludes `server/`, environment files, and `node_modules`; application-service releases remain operationally separate from public static releases.

The systemd service, nginx-to-Node route, Zoho API authentication, and real form-message delivery are operational and have been tested successfully. The repository records no OAuth secret, sensitive provider response, or personal test address.

## Privacy and legal boundary

The established technical facts are: listed form fields are transiently received by the Node service, email is generated transiently, the Zoho Mail API delivers it from `webform@` to `proje@`, no application database/local archive exists, and content-free rate-limit metadata is transient. The actual authorized people behind `proje@`, Zoho/hosting processor and transfer analysis, lawful basis, retention in recipient mailboxes/provider systems, deletion, complete notice text, Article 11 procedure, and acknowledgement/consent semantics still require factual confirmation and qualified legal review.
