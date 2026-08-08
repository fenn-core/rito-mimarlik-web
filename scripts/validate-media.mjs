#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const rootIndex = args.indexOf("--root");
const repositoryRoot = rootIndex >= 0
  ? resolve(args[rootIndex + 1] ?? "")
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repositoryRoot, "docs", "media-manifest.md");

function collectFiles(directory, extension) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if ([".git", "node_modules"].includes(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...collectFiles(path, extension));
    else if (path.endsWith(extension)) files.push(path);
  }
  return files;
}

function parseAttributes(source) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? null);
  }
  return attributes;
}

function parseTags(source, tagName = "[a-z][\\w-]*") {
  const tags = [];
  const pattern = new RegExp(`<(${tagName})\\b([^<>]*?)>`, "gi");
  for (const match of source.matchAll(pattern)) {
    tags.push({ tag: match[1].toLowerCase(), attributes: parseAttributes(match[2]), raw: match[0], index: match.index });
  }
  return tags;
}

function findElementRange(html, startIndex, openingTag, tagName) {
  const start = startIndex + openingTag.length;
  const pattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  pattern.lastIndex = start;
  let depth = 1;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (match[0].startsWith("</")) depth -= 1;
    else if (!match[0].endsWith("/>")) depth += 1;
    if (depth === 0) return { content: html.slice(start, match.index), end: pattern.lastIndex };
  }
  return { content: html.slice(start), end: html.length };
}

function parseManifest(markdown) {
  const slots = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\| `([a-z0-9-]+)` \|/);
    if (!match) continue;
    const columns = line.split("|").slice(1, -1).map((value) => value.trim());
    slots.push({
      id: match[1],
      route: columns[1] ?? "",
      purpose: columns[2] ?? "",
      loading: columns[4] ?? "",
      hero: /\bLCP\b/i.test(columns[2] ?? "") || /never lazy/i.test(columns[4] ?? ""),
      belowFold: /\blazy\b/i.test(columns[4] ?? "") && !/never lazy/i.test(columns[4] ?? ""),
    });
  }
  return slots;
}

function isRemote(value) {
  return /^(?:https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function resolveLocalAsset(value, htmlPath) {
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean || isRemote(clean) || clean.startsWith("data:")) return null;
  return clean.startsWith("/")
    ? resolve(repositoryRoot, `.${clean}`)
    : resolve(dirname(htmlPath), clean);
}

function parseSrcset(value) {
  return value.split(",").map((candidate) => {
    const parts = candidate.trim().split(/\s+/).filter(Boolean);
    return { path: parts[0] ?? "", descriptor: parts[1] ?? "", extra: parts.slice(2) };
  });
}

const issues = [];
const slots = [];
const assetUsage = new Map();
const addIssue = (level, code, message, context = {}) => issues.push({ level, code, message, ...context });

function validatePath(value, htmlPath, slotId, attribute) {
  if (!value) {
    addIssue("error", "empty-asset-path", `${attribute} is empty.`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
    return null;
  }
  if (isRemote(value)) {
    addIssue("warning", "remote-asset", `Remote asset is not fetched or validated: ${value}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
    return null;
  }
  const resolved = resolveLocalAsset(value, htmlPath);
  if (resolved === null) return null;
  const rootPrefix = `${repositoryRoot}${sep}`;
  if (resolved !== repositoryRoot && !resolved.startsWith(rootPrefix)) {
    addIssue("error", "asset-outside-repository", `Local asset resolves outside the repository: ${value}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
  } else if (!existsSync(resolved)) {
    addIssue("error", "missing-asset", `Local asset does not exist: ${value}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
  }
  const extension = extname(resolved).toLowerCase();
  if (extension === ".png") {
    addIssue("warning", "photographic-png", `PNG may be unnecessarily heavy for photographic media: ${value}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
  } else if (extension && ![".avif", ".webp", ".jpg", ".jpeg", ".png", ".svg"].includes(extension)) {
    addIssue("warning", "unusual-format", `Unusual media format: ${value}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
  }
  if (!assetUsage.has(resolved)) assetUsage.set(resolved, new Set());
  assetUsage.get(resolved).add(slotId);
  return resolved;
}

function validateSrcset(value, htmlPath, slotId, elementName) {
  if (value === "") {
    addIssue("error", "empty-srcset", `${elementName} srcset is empty.`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
    return;
  }
  const candidates = parseSrcset(value);
  const descriptors = new Set();
  const paths = new Set();
  for (const candidate of candidates) {
    if (!candidate.path || candidate.extra.length > 0 || (candidate.descriptor && !/^(?:\d+w|(?:\d+(?:\.\d+)?)x)$/.test(candidate.descriptor))) {
      addIssue("error", "malformed-srcset", `Malformed srcset candidate: ${candidate.path} ${candidate.descriptor}`.trim(), { slot: slotId, file: relative(repositoryRoot, htmlPath) });
      continue;
    }
    if (candidate.descriptor && descriptors.has(candidate.descriptor)) {
      addIssue("error", "duplicate-srcset-descriptor", `Duplicate srcset descriptor: ${candidate.descriptor}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
    }
    if (paths.has(candidate.path)) {
      addIssue("warning", "duplicate-srcset-path", `Duplicate srcset path: ${candidate.path}`, { slot: slotId, file: relative(repositoryRoot, htmlPath) });
    }
    descriptors.add(candidate.descriptor);
    paths.add(candidate.path);
    validatePath(candidate.path, htmlPath, slotId, `${elementName} srcset`);
  }
}

function validateImage(image, wrapper, htmlPath, manifestSlot) {
  const file = relative(repositoryRoot, htmlPath);
  const slotId = manifestSlot?.id ?? wrapper.slotId;
  const attrs = image.attributes;
  const src = attrs.get("src");
  if (src === null || src === undefined) addIssue("error", "missing-img-src", "Populated image is missing src.", { slot: slotId, file });
  else validatePath(src, htmlPath, slotId, "img src");

  if (!attrs.has("alt")) addIssue("error", "missing-alt", "Populated image is missing an alt attribute.", { slot: slotId, file });
  else if (/^(?:image|photo|placeholder|todo)$/i.test((attrs.get("alt") ?? "").trim())) {
    addIssue("warning", "poor-alt", `Alt text appears to be development text: ${attrs.get("alt")}`, { slot: slotId, file });
  }

  for (const dimension of ["width", "height"]) {
    if (!/^\d+$/.test(attrs.get(dimension) ?? "") || Number(attrs.get(dimension)) <= 0) {
      addIssue("error", `invalid-${dimension}`, `Populated image requires a positive numeric ${dimension} attribute.`, { slot: slotId, file });
    }
  }

  if (attrs.has("srcset")) validateSrcset(attrs.get("srcset") ?? "", htmlPath, slotId, "img");
  const loading = (attrs.get("loading") ?? "").toLowerCase();
  const decoding = (attrs.get("decoding") ?? "").toLowerCase();
  if (manifestSlot?.hero) {
    if (loading === "lazy") addIssue("error", "lazy-hero", "LCP/hero image must not be lazy-loaded.", { slot: slotId, file });
    if ((attrs.get("fetchpriority") ?? "").toLowerCase() !== "high") addIssue("warning", "hero-fetchpriority", "LCP/hero image should use fetchpriority=\"high\".", { slot: slotId, file });
  } else if (manifestSlot?.belowFold) {
    if (loading !== "lazy") addIssue("warning", "missing-lazy", "Below-fold image should use loading=\"lazy\".", { slot: slotId, file });
    if (decoding !== "async") addIssue("warning", "missing-async-decoding", "Below-fold image should use decoding=\"async\".", { slot: slotId, file });
  }

  const alt = attrs.get("alt");
  if ((wrapper.attributes.get("aria-hidden") ?? "").toLowerCase() === "true" && alt !== undefined && alt !== null && alt !== "") {
    addIssue("error", "informative-image-hidden", "Informative image is hidden by placeholder aria-hidden state.", { slot: slotId, file });
  }
}

try {
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifestSlots = parseManifest(readFileSync(manifestPath, "utf8"));
  const manifestById = new Map();
  for (const slot of manifestSlots) {
    if (manifestById.has(slot.id)) addIssue("error", "duplicate-manifest-slot", `Manifest slot is duplicated: ${slot.id}`, { slot: slot.id, file: "docs/media-manifest.md" });
    manifestById.set(slot.id, slot);
  }

  const markupById = new Map();
  for (const htmlPath of collectFiles(repositoryRoot, ".html")) {
    const html = readFileSync(htmlPath, "utf8");
    const slotRanges = [];
    for (const tag of parseTags(html)) {
      if (!tag.attributes.has("data-media-slot")) continue;
      const slotId = (tag.attributes.get("data-media-slot") ?? "").trim();
      const file = relative(repositoryRoot, htmlPath);
      if (!slotId) {
        addIssue("error", "empty-slot", "data-media-slot must not be empty.", { file });
        continue;
      }
      if (markupById.has(slotId)) addIssue("error", "duplicate-markup-slot", `Markup slot is duplicated: ${slotId}`, { slot: slotId, file });
      const classes = (tag.attributes.get("class") ?? "").split(/\s+/).filter(Boolean);
      if (!classes.includes("media-slot")) addIssue("error", "missing-media-slot-class", "Slot wrapper is missing the media-slot class.", { slot: slotId, file });
      const range = findElementRange(html, tag.index, tag.raw, tag.tag);
      const content = range.content;
      slotRanges.push({ start: tag.index, end: range.end });
      const images = parseTags(content, "img");
      const pictures = parseTags(content, "picture");
      const sources = parseTags(content, "source");
      const placeholderLabels = parseTags(content, "span");
      const populatedClass = classes.includes("is-media-populated");
      const hasImage = images.length > 0;
      if (populatedClass && !hasImage) addIssue("error", "populated-without-image", "is-media-populated is present but no img exists.", { slot: slotId, file });
      if (hasImage && !populatedClass) addIssue("error", "image-without-populated-state", "Real image exists but is-media-populated is missing.", { slot: slotId, file });
      if (images.length > 1) addIssue("error", "multiple-slot-images", "A media slot must contain one fallback img.", { slot: slotId, file });
      if (pictures.length > 1) addIssue("error", "multiple-slot-pictures", "A media slot must not contain multiple picture elements.", { slot: slotId, file });
      if (pictures.length > 0 && !hasImage) addIssue("error", "picture-without-image", "picture element has no fallback img.", { slot: slotId, file });
      if (sources.length > 0 && pictures.length === 0) addIssue("error", "source-without-picture", "source elements must be contained by a picture element.", { slot: slotId, file });
      if (hasImage && placeholderLabels.length > 0) addIssue("error", "placeholder-content-remains", "Placeholder label content remains in a populated slot.", { slot: slotId, file });
      for (const source of sources) {
        if (!source.attributes.has("srcset")) addIssue("error", "source-without-srcset", "source element is missing srcset.", { slot: slotId, file });
        else validateSrcset(source.attributes.get("srcset") ?? "", htmlPath, slotId, "source");
      }
      const wrapper = { slotId, attributes: tag.attributes };
      const manifestSlot = manifestById.get(slotId);
      for (const image of images) validateImage(image, wrapper, htmlPath, manifestSlot);
      const style = tag.attributes.get("style") ?? "";
      const position = style.match(/--media-position\s*:\s*([^;]+)/i)?.[1]?.trim();
      if (position && !/^(?:(?:\d+(?:\.\d+)?%|left|center|right|top|bottom)(?:\s+(?:\d+(?:\.\d+)?%|left|center|right|top|bottom))?)$/i.test(position)) {
        addIssue("warning", "malformed-media-position", `Unrecognized --media-position value: ${position}`, { slot: slotId, file });
      }
      slots.push({ id: slotId, file, state: hasImage ? "populated" : "placeholder" });
      markupById.set(slotId, { file });
    }

    // Future brand or other non-slot images still receive basic integrity checks.
    for (const image of parseTags(html, "img")) {
      if (slotRanges.some((range) => image.index > range.start && image.index < range.end)) continue;
      const wrapper = { slotId: "unassigned-image", attributes: new Map() };
      validateImage(image, wrapper, htmlPath, null);
    }
    for (const source of parseTags(html, "source")) {
      if (slotRanges.some((range) => source.index > range.start && source.index < range.end)) continue;
      if (!source.attributes.has("srcset")) addIssue("error", "source-without-srcset", "Unslotted source element is missing srcset.", { file: relative(repositoryRoot, htmlPath) });
      else validateSrcset(source.attributes.get("srcset") ?? "", htmlPath, "unassigned-image", "source");
    }
    for (const link of parseTags(html, "link")) {
      if ((link.attributes.get("rel") ?? "").split(/\s+/).includes("icon")) {
        const href = link.attributes.get("href");
        if (href === null || href === undefined) addIssue("error", "favicon-without-href", "Favicon link is missing href.", { file: relative(repositoryRoot, htmlPath) });
        else validatePath(href, htmlPath, "brand-favicon", "favicon href");
      }
    }
  }

  for (const slot of slots) if (!manifestById.has(slot.id)) addIssue("error", "slot-missing-from-manifest", `Markup slot is missing from manifest: ${slot.id}`, { slot: slot.id, file: slot.file });
  for (const slot of manifestSlots) if (!markupById.has(slot.id)) addIssue("error", "manifest-slot-missing-from-markup", `Manifest slot is missing from markup: ${slot.id}`, { slot: slot.id, file: "docs/media-manifest.md" });

  for (const [asset, usedBy] of assetUsage) {
    if (usedBy.size > 1) addIssue("warning", "duplicate-asset-use", `Asset is used by multiple slots: ${relative(repositoryRoot, asset)} (${[...usedBy].join(", ")})`, { file: relative(repositoryRoot, asset) });
  }

  const deferredBrandAssets = [
    "assets/branding/rito-logo.svg",
    "assets/branding/rito-logo-light.svg",
    "assets/branding/favicon.svg",
  ].filter((path) => !existsSync(join(repositoryRoot, path)));
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const report = {
    title: "MEDIA PREFLIGHT",
    root: repositoryRoot,
    summary: {
      totalSlots: slots.length,
      placeholders: slots.filter((slot) => slot.state === "placeholder").length,
      populated: slots.filter((slot) => slot.state === "populated").length,
      errors: errors.length,
      warnings: warnings.length,
    },
    slots: slots.sort((a, b) => a.id.localeCompare(b.id)),
    issues,
    deferredBrandAssets,
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(report.title);
    console.log(`Slots: ${report.summary.totalSlots} total, ${report.summary.placeholders} placeholders, ${report.summary.populated} populated`);
    console.log(`Errors: ${report.summary.errors} | Warnings: ${report.summary.warnings}\n`);
    const issuesBySlot = new Map();
    for (const issue of issues) {
      const key = issue.slot ?? issue.file ?? "repository";
      if (!issuesBySlot.has(key)) issuesBySlot.set(key, []);
      issuesBySlot.get(key).push(issue);
    }
    for (const slot of report.slots) {
      const slotIssues = issuesBySlot.get(slot.id) ?? [];
      const level = slotIssues.some((issue) => issue.level === "error") ? "ERROR" : slotIssues.length ? "WARN" : "PASS";
      console.log(`[${level}] ${slot.id} — ${slot.state}`);
    }
    for (const issue of issues) console.log(`[${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}${issue.slot ? ` (${issue.slot})` : ""}`);
    console.log("\nDEFERRED BRAND ASSETS");
    for (const path of deferredBrandAssets) console.log(`- ${path}`);
  }
  process.exitCode = errors.length > 0 ? 1 : 0;
} catch (error) {
  const failure = { title: "MEDIA PREFLIGHT", fatal: true, message: error instanceof Error ? error.message : String(error) };
  if (jsonMode) process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  else console.error(`${failure.title}\n[FATAL] ${failure.message}`);
  process.exitCode = 2;
}
