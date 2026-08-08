#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const stagedIndex = args.indexOf("--staged");
const stagedMode = stagedIndex >= 0;
const root = stagedMode ? resolve(args[stagedIndex + 1] ?? "") : repositoryRoot;
const supportedArguments = new Set(["--json", "--staged"]);

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--staged") {
    index += 1;
    continue;
  }
  if (!supportedArguments.has(args[index])) {
    throw new Error(`Unknown option: ${args[index]}`);
  }
}
if (stagedMode && (!args[stagedIndex + 1] || args[stagedIndex + 1].startsWith("--"))) {
  throw new Error("--staged requires a release directory path.");
}

const requiredPages = [
  "index.html",
  "404.html",
  "about/index.html",
  "services/index.html",
  "projects/index.html",
  "noise-barriers/index.html",
  "contact/index.html",
  "privacy/index.html",
];
const routeDirectories = new Set([
  "about",
  "services",
  "projects",
  "noise-barriers",
  "contact",
  "privacy",
]);
const publicDirectories = new Set([...routeDirectories, "css", "js", "assets"]);
const developmentEntries = [
  ".git",
  ".gitignore",
  ".vscode",
  "deploy",
  "docs",
  "scripts",
  "local_files",
  "node_modules",
  "README.md",
  "LICENSE",
];
const issues = [];
const info = [];
const externalReferences = new Set();
const add = (level, code, message, file) =>
  issues.push({ level, code, message, ...(file ? { file } : {}) });

function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (!stagedMode && entry === ".git") continue;
    const filePath = join(directory, entry);
    const fileInfo = lstatSync(filePath);
    if (fileInfo.isSymbolicLink()) {
      add("error", "public-symlink", "Public deployment trees must not contain symbolic links.", relative(root, filePath));
    } else if (fileInfo.isDirectory()) {
      files.push(...walk(filePath));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

function attributes(source) {
  const result = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? null);
  }
  return result;
}

function stripComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function toRelative(filePath) {
  return relative(root, filePath).split(sep).join("/");
}

function publicPath(filePath) {
  const rel = toRelative(filePath);
  const top = rel.split("/")[0];
  return requiredPages.includes(rel) || publicDirectories.has(top);
}

function localTarget(value, sourceFile) {
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean) return sourceFile;
  if (/^(?:https?:)?\/\//i.test(clean) || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  let target = clean.startsWith("/") ? resolve(root, `.${clean}`) : resolve(dirname(sourceFile), clean);
  if (clean.endsWith("/")) target = join(target, "index.html");
  return target;
}

function checkReference(value, sourceFile, tag, attribute) {
  const rel = toRelative(sourceFile);
  if (!value) {
    add("error", "empty-reference", `${tag} has an empty ${attribute}.`, rel);
    return;
  }
  if (/^(?:https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    externalReferences.add(value);
    if (tag !== "a") {
      add("warning", "external-runtime-asset", `External runtime reference requires CSP review: ${value}`, rel);
    }
    return;
  }

  const target = localTarget(value, sourceFile);
  if (target === null) return;
  const rootPrefix = `${root}${sep}`;
  if (target !== root && !target.startsWith(rootPrefix)) {
    add("error", "reference-outside-root", `Reference escapes the public root: ${value}`, rel);
    return;
  }
  if (!existsSync(target)) {
    add("error", "missing-reference", `Local reference does not exist: ${value}`, rel);
    return;
  }
  if (!publicPath(target)) {
    add("error", "development-file-reference", `Public page references a development-only file: ${value}`, rel);
  }

  const fragment = value.includes("#") ? value.slice(value.indexOf("#") + 1) : "";
  if (fragment && extname(target) === ".html") {
    const html = readFileSync(target, "utf8");
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`\\bid=["']${escaped}["']`).test(html)) {
      add("error", "missing-fragment", `Fragment target does not exist: ${value}`, rel);
    }
  }
}

function checkFormSafety() {
  const contactPath = join(root, "contact/index.html");
  const scriptPath = join(root, "js/quote-form.js");
  const contact = existsSync(contactPath) ? readFileSync(contactPath, "utf8") : "";
  const formTag = contact.match(/<form\b[^>]*\bid=["']project-inquiry["'][^>]*>/i)?.[0] ?? "";
  const formAttrs = attributes(formTag.replace(/^<form\b|>$/gi, ""));

  if (!formTag || formAttrs.get("data-submission-mode") !== "disabled") {
    add("error", "unsafe-form-mode", "Project inquiry form must remain in disabled submission mode.", "contact/index.html");
  }
  if (formAttrs.has("action") || formAttrs.has("method")) {
    add("error", "unsafe-form-target", "Disabled project inquiry form must not declare action or method.", "contact/index.html");
  }
  if (!/<button\b[^>]*\btype=["']button["'][^>]*\bdata-submission-trigger\b/i.test(contact)) {
    add("error", "unsafe-form-trigger", "Safe non-submit inquiry trigger is missing.", "contact/index.html");
  }

  const quoteScript = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";
  if (!/submissionMode\s*!==\s*["']disabled["']/.test(quoteScript) || !/preventDefault\s*\(/.test(quoteScript)) {
    add("error", "missing-submit-guard", "Disabled-mode submit prevention is missing.", "js/quote-form.js");
  }
  if (/\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/.test(stripComments(quoteScript))) {
    add("error", "unexpected-form-network", "Inquiry script contains an active network primitive.", "js/quote-form.js");
  }
}

function requireTemplatePattern(source, pattern, code, message) {
  if (!pattern.test(source)) add("error", code, message, "deploy/nginx/rito-mimarlik.conf.template");
}

function checkNginxAdapter() {
  const templatePath = join(repositoryRoot, "deploy/nginx/rito-mimarlik.conf.template");
  const docsPath = join(repositoryRoot, "docs/deployment.md");
  const stagePath = join(repositoryRoot, "scripts/stage-deployment.mjs");
  if (!existsSync(templatePath)) {
    add("error", "missing-nginx-template", "nginx deployment template is missing.", "deploy/nginx/rito-mimarlik.conf.template");
    return;
  }

  const nginx = readFileSync(templatePath, "utf8");
  const docs = existsSync(docsPath) ? readFileSync(docsPath, "utf8") : "";

  requireTemplatePattern(nginx, /root\s+\/srv\/www\/rito-mimarlik\/current\s*;/, "nginx-document-root", "Expected atomic current document root is missing.");
  requireTemplatePattern(nginx, /listen\s+80\s*;/, "nginx-http-listener", "HTTP listener is missing.");
  requireTemplatePattern(nginx, /return\s+301\s+https:\/\/\{\{PRIMARY_HOST\}\}\$request_uri\s*;/, "nginx-https-redirect", "Canonical HTTP-to-HTTPS redirect is missing.");
  requireTemplatePattern(nginx, /listen\s+443\s+ssl(?:\s+http2)?\s*;/, "nginx-https-listener", "HTTPS listener is missing.");
  requireTemplatePattern(nginx, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3\s*;/, "nginx-tls-policy", "TLS 1.2/1.3 policy is missing.");
  requireTemplatePattern(nginx, /error_page\s+404\s+\/404\.html\s*;/, "nginx-error-page", "Custom 404 mapping is missing.");
  requireTemplatePattern(nginx, /location\s*=\s*\/404\.html\s*\{[\s\S]*?\binternal\s*;/, "nginx-internal-error-page", "Custom 404 document must remain an internal error target.");
  requireTemplatePattern(nginx, /try_files\s+\$uri\s+\$uri\/\s+=404\s*;/, "nginx-route-policy", "Directory-index try_files policy is missing.");
  requireTemplatePattern(nginx, /\{\{PRIMARY_HOST\}\}/, "nginx-host-token", "Primary hostname template token is missing.");
  requireTemplatePattern(nginx, /ssl_certificate\s+\{\{ORIGIN_CERTIFICATE_PATH\}\}\s*;/, "nginx-certificate-token", "Origin certificate path token is missing.");
  requireTemplatePattern(nginx, /ssl_certificate_key\s+\{\{ORIGIN_PRIVATE_KEY_PATH\}\}\s*;/, "nginx-key-token", "Origin private-key path token is missing.");
  requireTemplatePattern(nginx, /include\s+\/etc\/nginx\/snippets\/cloudflare-realip\.conf\s*;/, "nginx-realip-include", "Cloudflare real-IP include is missing.");
  requireTemplatePattern(nginx, /real_ip_header\s+CF-Connecting-IP\s*;/, "nginx-realip-header", "Cloudflare real-IP header selection is missing.");
  requireTemplatePattern(nginx, /gzip\s+on\s*;/, "nginx-gzip", "gzip baseline is missing.");
  requireTemplatePattern(nginx, /expires\s+-1\s*;/, "nginx-html-cache", "HTML revalidation cache policy is missing.");
  requireTemplatePattern(nginx, /expires\s+1h\s*;/, "nginx-script-cache", "CSS/JavaScript cache policy is missing.");
  requireTemplatePattern(nginx, /expires\s+7d\s*;/, "nginx-media-cache", "Media cache policy is missing.");

  const requiredHeaders = [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Frame-Options",
  ];
  for (const header of requiredHeaders) {
    requireTemplatePattern(
      nginx,
      new RegExp(`^\\s*add_header\\s+${header.replace(/-/g, "\\-")}\\s+[^\\n]+\\salways\\s*;`, "m"),
      "nginx-security-header",
      `${header} is missing or does not use always.`,
    );
  }
  for (const directive of ["form-action 'none'", "connect-src 'none'", "frame-ancestors 'none'"]) {
    if (!nginx.includes(directive)) add("error", "nginx-csp-policy", `CSP is missing ${directive}.`, "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/try_files[^;]*\/index\.html/i.test(nginx) || /error_page\s+404\s+=200/i.test(nginx)) {
    add("error", "nginx-spa-fallback", "nginx template contains a homepage/HTTP-200 fallback.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/\bproxy_pass\b|\bupstream\s+[^{]+\{|location\s+(?:=|\^~|~\*?)?\s*\/api(?:\/|\s|\{)/i.test(nginx)) {
    add("error", "nginx-active-backend", "nginx template must not activate an API/upstream.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/add_header\s+Cache-Control/i.test(nginx)) {
    add("error", "nginx-header-inheritance", "Cache locations must not add headers that suppress inherited security headers.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/^\s*set_real_ip_from\s+/m.test(nginx)) {
    add("error", "nginx-stale-cloudflare-ranges", "Cloudflare CIDRs must be maintained outside the repository template.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/add_header\s+Strict-Transport-Security/i.test(nginx)) {
    add("error", "nginx-premature-hsts", "Initial nginx template must not force HSTS before hostname verification.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  if (/\b(?:example\.com|ritomimarlik\.com)\b/i.test(nginx)) {
    add("error", "nginx-fabricated-host", "nginx template contains a fabricated hostname.", "deploy/nginx/rito-mimarlik.conf.template");
  }
  const serverNames = [...nginx.matchAll(/^\s*server_name\s+([^;]+);/gm)].map((match) => match[1].trim());
  if (serverNames.length !== 2 || serverNames.some((name) => name !== "{{PRIMARY_HOST}}")) {
    add("error", "nginx-hostname-isolation", "Every server_name must use only the unresolved primary-host token.", "deploy/nginx/rito-mimarlik.conf.template");
  }

  if (!existsSync(stagePath)) add("error", "missing-stage-script", "Static staging script is missing.", "scripts/stage-deployment.mjs");
  if (!docs) {
    add("error", "missing-deployment-docs", "Deployment runbook is missing.", "docs/deployment.md");
  } else {
    const documentationChecks = [
      [/Full \(strict\)/i, "Cloudflare Full (strict) policy"],
      [/Cloudflare Origin CA/i, "Cloudflare Origin CA strategy"],
      [/nginx -V[\s\S]*nginx -T/i, "real-server nginx inspection"],
      [/ips-v4[\s\S]*ips-v6/i, "official Cloudflare IP-list source"],
      [/MX[\s\S]*SPF[\s\S]*DKIM[\s\S]*DMARC/i, "email DNS coexistence"],
    ];
    for (const [pattern, label] of documentationChecks) {
      if (!pattern.test(docs)) add("error", "deployment-documentation", `Deployment runbook is missing ${label}.`, "docs/deployment.md");
    }
  }
}

try {
  if (!existsSync(root)) throw new Error(`Validation root does not exist: ${root}`);

  for (const page of requiredPages) {
    if (!existsSync(join(root, page))) add("error", "missing-route", `Required public page is missing: ${page}`, page);
  }

  const files = walk(root);
  const publicFiles = files.filter(publicPath);
  const publicSourceFiles = publicFiles.filter((filePath) => [".html", ".css", ".js"].includes(extname(filePath)));

  if (stagedMode) {
    for (const filePath of files) {
      const rel = toRelative(filePath);
      if (!publicPath(filePath)) add("error", "staged-development-leak", `Non-public file leaked into staged output: ${rel}`, rel);
      if (rel.split("/").some((part) => part === ".gitkeep" || part.startsWith("."))) {
        add("error", "staged-dotfile", `Dotfile leaked into staged output: ${rel}`, rel);
      }
    }
    for (const entry of developmentEntries) {
      if (existsSync(join(root, entry))) add("error", "staged-development-leak", `Development entry leaked into staged output: ${entry}`, entry);
    }
  }

  for (const filePath of publicFiles) {
    const rel = toRelative(filePath);
    const top = rel.split("/")[0];
    if (!stagedMode && rel.split("/").some((part) => part.startsWith("."))) {
      add("warning", "public-dotfile", `Dotfile must be excluded from staging: ${rel}`, rel);
    }
    if (extname(filePath) === ".map") add("warning", "source-map", `Source map requires deployment review: ${rel}`, rel);
    if (routeDirectories.has(top) && rel !== `${top}/index.html`) {
      add(stagedMode ? "error" : "warning", "unexpected-route-file", `Unexpected file in public route directory: ${rel}`, rel);
    }
    if (top === "css" && extname(filePath) !== ".css") add(stagedMode ? "error" : "warning", "unexpected-css-file", `Non-CSS file in css/: ${rel}`, rel);
    if (top === "js" && extname(filePath) !== ".js") add(stagedMode ? "error" : "warning", "unexpected-js-file", `Non-JavaScript file in js/: ${rel}`, rel);
  }

  for (const filePath of publicSourceFiles) {
    const rel = toRelative(filePath);
    const source = readFileSync(filePath, "utf8");
    const runtimeSource = stripComments(source);
    if (/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(runtimeSource)) add("error", "development-host", "Public source contains a localhost runtime reference.", rel);
    if (extname(filePath) === ".js" && /\bconsole\.(?:log|debug)\s*\(/.test(runtimeSource)) add("warning", "debug-console", "Public JavaScript contains console logging.", rel);
    if (extname(filePath) === ".html") {
      if (/<style\b|\sstyle\s*=|\son[a-z]+\s*=|<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(runtimeSource)) {
        add("error", "csp-inline-source", "Inline style/script/handler conflicts with the active CSP.", rel);
      }
      for (const match of runtimeSource.matchAll(/<([a-z][\w-]*)\b([^<>]*?)>/gi)) {
        const tag = match[1].toLowerCase();
        const attrs = attributes(match[2]);
        for (const attribute of ["href", "src"]) {
          if (attrs.has(attribute)) checkReference(attrs.get(attribute), filePath, tag, attribute);
        }
      }
    }
    if (extname(filePath) === ".css") {
      for (const match of runtimeSource.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        checkReference(match[1], filePath, "css-url", "url");
      }
    }
    if (extname(filePath) === ".js") {
      for (const match of runtimeSource.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
        checkReference(match[1], filePath, "module", "specifier");
      }
    }
  }

  const sensitivePatterns = [
    [/^\.env(?:\.|$)/i, "environment file"],
    [/\.(?:pem|key|p12|pfx)$/i, "key or certificate"],
    [/^(?:credentials?|secrets?)(?:[._-]|$)/i, "credential file"],
    [/\.(?:sqlite|sqlite3|db)$/i, "database"],
    [/\.(?:bak|backup|dump|zip|tar|tgz|gz|7z)$/i, "backup or archive"],
    [/\.swp$/i, "editor swap file"],
  ];
  for (const filePath of files) {
    const name = filePath.split(sep).at(-1);
    for (const [pattern, description] of sensitivePatterns) {
      if (pattern.test(name)) add("error", "sensitive-file", `${stagedMode ? "Staged output" : "Repository"} contains a possible ${description}: ${toRelative(filePath)}`, toRelative(filePath));
    }
  }

  checkFormSafety();
  if (!stagedMode) checkNginxAdapter();

  const mediaScript = join(repositoryRoot, "scripts/validate-media.mjs");
  if (!stagedMode && !existsSync(mediaScript)) add("error", "missing-media-validator", "Media validator is missing.", "scripts/validate-media.mjs");

  if (!stagedMode) {
    const exclusionsPresent = developmentEntries.filter((entry) => existsSync(join(repositoryRoot, entry)));
    info.push({ code: "development-exclusions", message: `Excluded by staging: ${exclusionsPresent.join(", ")}` });
    info.push({ code: "media-preflight", message: "The staging script gates release creation on both deployment and media validators." });
  } else {
    info.push({ code: "staged-root", message: "Validated a staged public-only release tree." });
  }
  info.push({ code: "public-file-count", message: `${publicFiles.length} files match the public allowlist.` });

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const hasIssue = (...codes) => issues.some((issue) => codes.includes(issue.code));
  const checks = {
    routes: requiredPages.every((page) => existsSync(join(root, page))) ? "pass" : "error",
    localAssets: hasIssue("missing-reference", "missing-fragment", "reference-outside-root", "development-file-reference") ? "error" : "pass",
    cspSourceCompatibility: hasIssue("csp-inline-source") ? "error" : "pass",
    formSafety: issues.some((issue) => issue.code.startsWith("unsafe-form") || ["missing-submit-guard", "unexpected-form-network"].includes(issue.code)) ? "error" : "pass",
    sensitiveFiles: hasIssue("sensitive-file") ? "error" : "pass",
    publicOnlyTree: stagedMode && hasIssue("staged-development-leak", "staged-dotfile", "public-symlink") ? "error" : "pass",
    ...(stagedMode
      ? {}
      : {
          nginxAdapter: issues.some((issue) => issue.code.startsWith("nginx-") || ["missing-nginx-template", "missing-stage-script", "missing-deployment-docs", "deployment-documentation"].includes(issue.code)) ? "error" : "pass",
          mediaValidatorAvailable: existsSync(mediaScript) ? "pass" : "error",
        }),
  };
  const report = {
    title: stagedMode ? "STAGED DEPLOYMENT PREFLIGHT" : "DEPLOYMENT PREFLIGHT",
    mode: stagedMode ? "staged" : "repository",
    root,
    summary: { routes: requiredPages.length, publicFiles: publicFiles.length, errors: errors.length, warnings: warnings.length },
    checks,
    issues,
    info,
    externalReferences: [...externalReferences],
    deferred: stagedMode
      ? []
      : [
          "Final hostname, proxied DNS records, and Cloudflare Origin CA certificate",
          "Real-server nginx syntax/module/listener validation",
          "Canonical URLs, sitemap, and social metadata",
        ],
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(report.title);
    for (const [name, state] of Object.entries(report.checks)) console.log(`[${state.toUpperCase()}] ${name}`);
    console.log(`\nRoutes: ${report.summary.routes} | Public files: ${report.summary.publicFiles}`);
    console.log(`Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings}`);
    for (const issue of issues) console.log(`[${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}`);
    for (const item of info) console.log(`[INFO] ${item.message}`);
    if (report.deferred.length > 0) {
      console.log("\nDEFERRED");
      for (const item of report.deferred) console.log(`- ${item}`);
    }
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonMode) process.stdout.write(`${JSON.stringify({ title: "DEPLOYMENT PREFLIGHT", fatal: true, message }, null, 2)}\n`);
  else console.error(`DEPLOYMENT PREFLIGHT\n[FATAL] ${message}`);
  process.exitCode = 2;
}
