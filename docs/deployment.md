# nginx + Cloudflare deployment profile

Rito Mimarlık is deployed as plain static files behind Cloudflare. Cloudflare provides authoritative DNS, proxied web traffic, edge TLS and the outer CDN/security layer. nginx terminates validated origin TLS and owns static routing, cache/compression policy, response headers, logs and the real 404 response.

```text
Browser --HTTPS--> Cloudflare --HTTPS--> nginx --> static release
```

The production hostname is deliberately unresolved in this repository. Replace `{{PRIMARY_HOST}}` only after the hostname is confirmed; do not commit a guessed domain.

## Repository, staging and server roots

The repository root is the source document root. It must never be uploaded wholesale. Create an exact public release with:

```sh
node scripts/validate-deployment.mjs
node scripts/validate-media.mjs
node scripts/stage-deployment.mjs --output /tmp/rito-release-<release-id>
node scripts/validate-deployment.mjs --staged /tmp/rito-release-<release-id>
```

The staging script runs both validators again as blocking child processes before copying. It accepts only a nonexistent destination outside this repository, resolves symlinked parents before its safety checks, and never cleans or overwrites a user directory. It copies the root `index.html` and `404.html`, the seven route documents, `css/`, `js/`, and verified files under `assets/`; dotfiles and development files remain excluded.

Use this server layout:

```text
/srv/www/rito-mimarlik/
├── releases/
│   ├── <release-id>/
│   └── ...
└── current -> releases/<release-id>/
```

nginx serves `/srv/www/rito-mimarlik/current`. Each release contains only:

- `index.html`, `404.html`
- `about/`, `services/`, `projects/`, `noise-barriers/`, `contact/`, `privacy/`
- `css/`, `js/`
- `assets/` when genuine assets exist

Never place `docs/`, `scripts/`, `deploy/`, `.git/`, repository notes, keys, certificates, screenshots or test output below `current`.

## Route and error behavior

The template at `deploy/nginx/rito-mimarlik.conf.template` uses normal directory-index behavior:

| URL | File |
| --- | --- |
| `/` | `index.html` |
| `/about/` | `about/index.html` |
| `/services/` | `services/index.html` |
| `/projects/` | `projects/index.html` |
| `/noise-barriers/` | `noise-barriers/index.html` |
| `/contact/` | `contact/index.html` |
| `/privacy/` | `privacy/index.html` |

nginx normally canonicalizes an existing bare directory such as `/about` to `/about/`. Unknown files and nested paths return a real HTTP 404 and render `/404.html`; they never fall back to the homepage. `/api/` is only a future namespace and currently returns 404 like any other nonexistent path.

## nginx template activation

Before installing the template, inspect the real host:

```sh
nginx -V
nginx -T
systemctl status nginx
```

Also inspect current TCP listeners, enabled server blocks, the nginx runtime user, service/include layout, loaded modules and other applications sharing ports 80/443. `listen ... http2` syntax and the final config installation path must match that installed nginx build; do not assume an otherwise empty server.

Substitute exactly these tokens in a copy of the template:

- `{{PRIMARY_HOST}}`
- `{{ORIGIN_CERTIFICATE_PATH}}`
- `{{ORIGIN_PRIVATE_KEY_PATH}}`

Install a current Cloudflare real-IP include at `/etc/nginx/snippets/cloudflare-realip.conf` before testing the site config. Then run `nginx -t`. Reload only after a successful test, normally with `systemctl reload nginx` after verifying the host's service name. This repository has not run `nginx -t` against the actual server.

Port 80 redirects to the same host over HTTPS. Port 443 serves the site with TLS 1.2/1.3. JavaScript redirects and SPA rewrites are intentionally absent.

## Cloudflare DNS and origin TLS

The eventual web A, AAAA or CNAME record points at the self-hosted origin and is **proxied**. Set Cloudflare SSL/TLS mode to **Full (strict)**—never Flexible—so both browser-to-edge and edge-to-origin legs use HTTPS with certificate validation.

Cloudflare Origin CA is the preferred origin certificate for this continuously proxied architecture. Generate it only after the final hostname is known and include that hostname in the certificate. Store the private key outside the public release tree with restricted permissions. A publicly trusted certificate such as Let's Encrypt remains a valid later alternative if direct-origin browser trust is operationally necessary.

HTTP-to-HTTPS redirection may also be enabled at the edge, but the origin redirect remains valid and does not create a loop under Full (strict). Future APIs must also use HTTPS.

HSTS is not active in the initial template. After end-to-end TLS and hostname behavior are proven, begin with a short `max-age` such as 300. Increase only after stable operation. Do not add `includeSubDomains` or `preload` until every subdomain and mail-related dependency is understood.

Canonical URLs, absolute sitemap URLs, `og:url` and social cards remain deferred until the hostname and final media are known.

## Security headers

The nginx HTTPS server applies these headers with `always`, including error responses:

| Header | Active value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'none'; upgrade-insecure-requests` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `X-Frame-Options` | `DENY` (legacy reinforcement for `frame-ancestors 'none'`) |

Cache locations use nginx `expires` rather than child `add_header` directives. This deliberately preserves inheritance of the server-level security headers. `form-action 'none'` remains because delivery uses JavaScript JSON rather than native form navigation; `connect-src 'self'` permits only the same-origin inquiry request.

## Cache and compression

The template implements:

- HTML and `404.html`: `expires -1`, producing revalidation/no-cache behavior
- Versionless CSS/JavaScript: one hour; not immutable
- Media and finalized branding: seven days while names remain unhashed
- Future content-hashed assets: eligible later for one year plus `immutable`

gzip is enabled for HTML and the configured text/CSS/JavaScript/JSON/SVG types. Already compressed raster formats are excluded. Brotli is optional and intentionally inactive until the installed nginx build/module is verified. No precompressed copies are committed.

## Cloudflare client IP and origin protection

Never trust `CF-Connecting-IP` from every source. The nginx template sets `real_ip_header CF-Connecting-IP`, but trusts it only through `set_real_ip_from` networks in `/etc/nginx/snippets/cloudflare-realip.conf`.

Generate that include from Cloudflare's current official lists at `https://www.cloudflare.com/ips-v4` and `https://www.cloudflare.com/ips-v6`. Validate every returned line as IPv4/IPv6 CIDR before rendering `set_real_ip_from <cidr>;`. Do not copy remembered ranges into this repository. Refresh the include when Cloudflare publishes range changes and run `nginx -t` before reload. Until the include exists and is current, proxy headers are not authenticated visitor identities.

Knowing the origin IP can permit Cloudflare bypass. After inspecting other services on the host, prefer firewall rules that allow web ports 80/443 only from current Cloudflare networks. Never modify SSH or unrelated service access as part of that change. Cloudflare Authenticated Origin Pulls is optional later hardening; zone/per-hostname certificates provide stronger account-specific assurance than the global Cloudflare AOP certificate. Neither firewall automation nor AOP is required for the first stable Full (strict) deployment.

## Logs and permissions

The template writes conventional per-site logs to:

- `/var/log/nginx/rito-mimarlik.access.log`
- `/var/log/nginx/rito-mimarlik.error.log`

With a valid real-IP include, standard nginx logging records the restored visitor address. Do not enable debug logging for normal production.

nginx needs read/traverse access to the release tree, never write access. Use ordinary read-only static permissions; do not use `777` and do not make nginx own the entire deployment tree merely for convenience. Determine the actual runtime user from the server. Keep the origin private key more restricted than public files.

## Atomic release and rollback runbook

1. Run both repository validators.
2. Stage a new public tree outside the repository and validate it with `--staged`.
3. Transfer it to `/srv/www/rito-mimarlik/releases/<release-id>/` and verify file count/size and ownership.
4. From `/srv/www/rito-mimarlik`, create a temporary relative symlink such as `current.next -> releases/<release-id>`, then atomically replace `current` with it (for example, GNU `mv -Tf current.next current` after verifying both paths). Never replace the releases directory itself.
5. Run `nginx -t`; reload nginx only when it passes.
6. Check `/`, every directory route, a CSS asset, and a deliberately nonexistent route through the public HTTPS hostname. Confirm the nonexistent route remains HTTP 404 while rendering the custom document, then inspect headers/logs. `/404.html` is an internal nginx error target rather than a public test URL.
7. Retain at least one prior release. Roll back by atomically repointing `current`, retesting nginx, and reloading if needed.

The exact transfer/login commands are deferred until server access details are known. The stable `current` path keeps nginx configuration independent of release IDs.

## Inquiry API production runtime

The verified runtime path is:

`Browser → /api/inquiry → nginx → 127.0.0.1:8787 → rito-inquiry.service → smtp.zoho.eu:465 → webform@ritomimarlik.com → proje@ritomimarlik.com`

nginx proxies exactly `/api/inquiry` to the loopback service using the contract in `deploy/nginx/rito-mimarlik.conf.template`. `GET /health` is not proxied and remains loopback-only. The service runs from `/opt/rito-inquiry/current`, reads `/etc/rito-inquiry/inquiry.env`, and is enabled as `rito-inquiry.service`.

The nginx-to-Node route, systemd service, Zoho EU SMTP authentication, and real form-message delivery have all succeeded in production. No credential, sensitive SMTP response, or personal test address is recorded in the repository.

## DNS coexistence

Web DNS changes and email DNS records coexist in the same Cloudflare zone. Any later automation must touch only explicitly selected web-host records. It must not replace or delete MX, SPF TXT, DKIM TXT/CNAME or DMARC TXT records. Decide apex/`www` canonicalization, origin IP records, certificate issuance and DNS attachment only after the final hostname is confirmed.
