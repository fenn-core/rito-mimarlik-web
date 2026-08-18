#!/usr/bin/env node

import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const jsonRequested = process.argv.includes("--json");
const requiredFiles = [
  "index.html",
  "404.html",
  "about/index.html",
  "services/index.html",
  "projects/index.html",
  "noise-barriers/index.html",
  "contact/index.html",
  "privacy/index.html",
];
const publicDirectories = new Map([
  ["css", new Set([".css"])],
  ["js", new Set([".js"])],
  [
    "assets",
    new Set([".avif", ".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico"]),
  ],
]);
const forbiddenBasenames = new Set([
  ".git",
  "deploy",
  "docs",
  "scripts",
  "node_modules",
]);

function parseArguments(argv) {
  const options = { output: null, json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--output") {
      options.output = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Bilinmeyen seçenek: ${argument}`);
  }

  if (!options.output) {
    throw new Error("Kullanım: node scripts/stage-deployment.mjs --output <yeni-dizin> [--json]");
  }

  return options;
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isSameOrDescendant(candidate, parent) {
  const relation = path.relative(parent, candidate);
  return relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation));
}

async function resolveThroughExistingParent(target) {
  let existingParent = path.dirname(target);
  while (!(await pathExists(existingParent))) {
    const next = path.dirname(existingParent);
    if (next === existingParent) throw new Error(`Çıktı üst dizini çözümlenemedi: ${target}`);
    existingParent = next;
  }
  const resolvedParent = await realpath(existingParent);
  return path.resolve(resolvedParent, path.relative(existingParent, target));
}

async function assertSafeOutput(rawOutput) {
  const output = path.resolve(rawOutput);
  const resolvedRepository = await realpath(repositoryRoot);
  const repositoryParent = path.dirname(resolvedRepository);
  const resolvedOutput = await resolveThroughExistingParent(output);
  const forbiddenExact = new Set([
    path.parse(resolvedOutput).root,
    resolvedRepository,
    repositoryParent,
    "/home",
    "/srv",
    "/var",
    "/etc",
    "/usr",
    "/opt",
  ]);

  if (forbiddenExact.has(resolvedOutput)) {
    throw new Error(`Güvenli olmayan çıktı hedefi reddedildi: ${resolvedOutput}`);
  }

  if (isSameOrDescendant(resolvedOutput, resolvedRepository)) {
    throw new Error("Dağıtım çıktısı depo içinde oluşturulamaz; /tmp veya ayrı bir sürüm yolu kullanın.");
  }

  if (isSameOrDescendant(resolvedRepository, resolvedOutput)) {
    throw new Error("Dağıtım çıktısı depo dizininin üst dizini olamaz.");
  }

  for (const criticalTree of ["/etc", "/usr", "/bin", "/sbin", "/boot", "/dev", "/proc", "/sys", "/run"]) {
    if (isSameOrDescendant(resolvedOutput, criticalTree)) {
      throw new Error(`Sistem dizini altında staging reddedildi: ${resolvedOutput}`);
    }
  }

  if (await pathExists(output)) {
    throw new Error("Çıktı hedefi zaten var. Script güvenlik gereği mevcut dizinleri temizlemez veya üzerine yazmaz.");
  }

  return output;
}

async function assertSourceReadiness() {
  for (const relativePath of requiredFiles) {
    if (!(await pathExists(path.join(repositoryRoot, relativePath)))) {
      throw new Error(`Zorunlu kamu dosyası eksik: ${relativePath}`);
    }
  }

  for (const tool of ["scripts/validate-deployment.mjs", "scripts/validate-media.mjs"]) {
    if (!(await pathExists(path.join(repositoryRoot, tool)))) {
      throw new Error(`Zorunlu ön kontrol aracı eksik: ${tool}`);
    }
  }

  const contactHtml = await readFile(path.join(repositoryRoot, "contact/index.html"), "utf8");
  const formTag = contactHtml.match(/<form\b[^>]*\bid=["']project-inquiry["'][^>]*>/i)?.[0] ?? "";
  if (!formTag || !/data-submission-mode=["']active["']/i.test(formTag)) {
    throw new Error("Proje talep formu etkin API modunda değil.");
  }
  if (/\s(?:action|method)\s*=/i.test(formTag)) {
    throw new Error("JavaScript ile gönderilen proje talep formunda action/method özniteliği bulundu.");
  }
}

function runPreflight(relativeScript, label) {
  const scriptPath = path.join(repositoryRoot, relativeScript);
  const result = spawnSync(process.execPath, [scriptPath, "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });

  if (result.error) {
    throw new Error(`${label} çalıştırılamadı: ${result.error.message}`);
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    const diagnostic = (result.stderr || result.stdout || "çıktı yok").trim();
    throw new Error(`${label} geçerli JSON raporu üretmedi: ${diagnostic}`);
  }

  if (result.status !== 0 || report.fatal || (report.summary?.errors ?? 0) > 0) {
    const messages = Array.isArray(report.issues)
      ? report.issues
          .filter((issue) => issue.level === "error")
          .slice(0, 5)
          .map((issue) => `${issue.code}: ${issue.message}`)
          .join(" | ")
      : report.message;
    throw new Error(`${label} başarısız${messages ? `: ${messages}` : ""}`);
  }

  return {
    label,
    errors: report.summary?.errors ?? 0,
    warnings: report.summary?.warnings ?? 0,
  };
}

async function copyPublicFile(relativePath, temporaryOutput, manifest) {
  const source = path.join(repositoryRoot, relativePath);
  const destination = path.join(temporaryOutput, relativePath);
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
    throw new Error(`Kamu dosyası normal bir dosya değil: ${relativePath}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  manifest.push({ path: relativePath, bytes: sourceInfo.size });
}

async function copyPublicDirectory(relativeDirectory, allowedExtensions, temporaryOutput, manifest) {
  const sourceDirectory = path.join(repositoryRoot, relativeDirectory);
  if (!(await pathExists(sourceDirectory))) return;

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = path.posix.join(relativeDirectory.split(path.sep).join("/"), entry.name);
    const sourcePath = path.join(repositoryRoot, relativePath);
    const sourceInfo = await lstat(sourcePath);

    if (sourceInfo.isSymbolicLink()) {
      throw new Error(`Kamu ağacında sembolik bağlantıya izin verilmez: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await copyPublicDirectory(relativePath, allowedExtensions, temporaryOutput, manifest);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Desteklenmeyen kamu dosya türü: ${relativePath}`);
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error(`Kamu dizininde izin verilmeyen dosya uzantısı: ${relativePath}`);
    }
    await copyPublicFile(relativePath, temporaryOutput, manifest);
  }
}

function collectAttributeReferences(html) {
  const references = [];
  const pattern = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
  let match;
  while ((match = pattern.exec(html))) references.push(match[2]);
  return references;
}

async function validateStagedTree(stagedRoot, manifest) {
  const stagedPaths = new Set(manifest.map((entry) => `/${entry.path}`));

  for (const requiredFile of requiredFiles) {
    if (!stagedPaths.has(`/${requiredFile}`)) {
      throw new Error(`Staged çıktıda zorunlu dosya eksik: ${requiredFile}`);
    }
  }

  for (const name of forbiddenBasenames) {
    if (await pathExists(path.join(stagedRoot, name))) {
      throw new Error(`Geliştirme dizini staged çıktıya sızdı: ${name}/`);
    }
  }

  for (const entry of manifest.filter(({ path: filePath }) => filePath.endsWith(".html"))) {
    const html = await readFile(path.join(stagedRoot, entry.path), "utf8");
    for (const reference of collectAttributeReferences(html)) {
      if (!reference || reference.startsWith("#") || /^(?:https?:|mailto:|tel:|data:)/i.test(reference)) continue;
      const pathPart = reference.split("#", 1)[0].split("?", 1)[0];
      if (!pathPart) continue;

      const candidate = pathPart.startsWith("/")
        ? pathPart
        : `/${path.posix.normalize(path.posix.join(path.posix.dirname(`/${entry.path}`), pathPart))}`.replace(/^\/\//, "/");
      const normalized = decodeURIComponent(candidate);
      const acceptable = normalized.endsWith("/")
        ? `${normalized}index.html`
        : normalized;
      if (!stagedPaths.has(normalized) && !stagedPaths.has(acceptable)) {
        throw new Error(`Staged yerel referans çözümlenemedi: ${entry.path} -> ${reference}`);
      }
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const output = await assertSafeOutput(options.output);
  await assertSourceReadiness();
  const preflights = [
    runPreflight("scripts/validate-deployment.mjs", "Deployment preflight"),
    runPreflight("scripts/validate-media.mjs", "Media preflight"),
  ];

  const temporaryOutput = `${output}.staging-${process.pid}-${Date.now()}`;
  let temporaryCreated = false;
  const manifest = [];

  try {
    if (await pathExists(temporaryOutput)) {
      throw new Error(`Geçici staging yolu zaten var: ${temporaryOutput}`);
    }
    await mkdir(temporaryOutput, { recursive: true });
    temporaryCreated = true;

    for (const relativePath of requiredFiles) {
      await copyPublicFile(relativePath, temporaryOutput, manifest);
    }
    for (const [relativeDirectory, extensions] of publicDirectories) {
      await copyPublicDirectory(relativeDirectory, extensions, temporaryOutput, manifest);
    }

    manifest.sort((left, right) => left.path.localeCompare(right.path));
    await validateStagedTree(temporaryOutput, manifest);
    if (await pathExists(output)) {
      throw new Error("Çıktı hedefi staging sırasında oluşturuldu; güvenlik gereği üzerine yazılmadı.");
    }
    await rename(temporaryOutput, output);
    temporaryCreated = false;

    const summary = {
      status: "pass",
      output,
      files: manifest.length,
      bytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0),
      routes: requiredFiles.length,
      preflights,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      console.log("STATIC DEPLOYMENT STAGE");
      console.log("");
      console.log(`[PASS] ${summary.files} kamu dosyası güvenli staging çıktısına kopyalandı.`);
      console.log(`[PASS] ${summary.routes} rota/hata belgesi doğrulandı.`);
      for (const preflight of preflights) {
        console.log(`[PASS] ${preflight.label}: ${preflight.errors} hata, ${preflight.warnings} uyarı.`);
      }
      console.log(`[PASS] Geliştirme dosyaları dışarıda bırakıldı.`);
      console.log("");
      console.log(`Output: ${summary.output}`);
      console.log(`Size: ${summary.bytes} bytes`);
    }
  } catch (error) {
    if (temporaryCreated) {
      await rm(temporaryOutput, { recursive: true, force: true });
    }
    throw error;
  }
}

main().catch((error) => {
  if (jsonRequested) {
    process.stdout.write(`${JSON.stringify({ status: "error", message: error.message }, null, 2)}\n`);
  } else {
    console.error(`STAGING ERROR: ${error.message}`);
  }
  process.exitCode = 1;
});
