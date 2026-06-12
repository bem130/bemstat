#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_TARGET_PATH = "README.md";
const DEFAULT_BRANCH = "main";
const MAX_PURGE_URLS = 100;
const GITHUB_REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function listValues(value) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("#"));
}

export function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function parsePurgeTarget(value, defaults) {
  const target = String(value ?? "").trim();
  if (target.length === 0) throw new Error("empty purge target");

  const repoTarget = target.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([^:]+))?:(.+)$/);
  if (repoTarget !== null) {
    return normalizeTarget({
      repository: repoTarget[1],
      branch: repoTarget[2] ?? defaults.branch,
      path: repoTarget[3],
    });
  }

  return normalizeTarget({
    repository: defaults.repository,
    branch: defaults.branch,
    path: target,
  });
}

export function purgeTargetsFromValue(value, defaults) {
  const values = listValues(value);
  const targets = values.length > 0 ? values : [DEFAULT_TARGET_PATH];
  return targets.map((target) => parsePurgeTarget(target, defaults));
}

export function normalizeTarget(target) {
  if (!GITHUB_REPOSITORY_RE.test(target.repository)) {
    throw new Error(`invalid purge repository: ${target.repository}`);
  }

  const branch = String(target.branch ?? "").trim();
  if (branch.length === 0 || /[\s\u0000-\u001f\u007f]/.test(branch)) {
    throw new Error(`invalid purge branch for ${target.repository}: ${target.branch}`);
  }

  const path = String(target.path ?? "").trim().replace(/\\/g, "/");
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(path) ||
    path.split("/").some((part) => part.length === 0 || part === "." || part === "..") ||
    /[:\s\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error(`invalid purge path for ${target.repository}: ${target.path}`);
  }

  return { repository: target.repository, branch, path };
}

export function readmePageUrl(target) {
  return `https://github.com/${encodePath(target.repository)}/blob/${encodePath(target.branch)}/${encodePath(target.path)}`;
}

export function extractCamoUrls(html) {
  const urls = new Set();
  const attrRe = /<(?:img|source)\b[^>]*?\s(?:src|srcset)=(["'])(.*?)\1/gi;
  for (const match of String(html ?? "").matchAll(attrRe)) {
    const value = htmlDecode(match[2]);
    for (const candidate of value.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (isCamoUrl(url)) urls.add(url);
    }
  }
  return urls;
}

export function camoUrlsFromValue(value) {
  return listValues(value).map((url) => {
    if (!isCamoUrl(url)) throw new Error(`invalid direct camo URL: ${url}`);
    return url;
  });
}

export async function purgeFromEnv(env = process.env, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? console;
  const strict = parseBoolean(env.BEMSTAT_PURGE_STRICT);
  const defaults = {
    repository: env.BEMSTAT_PURGE_DEFAULT_REPOSITORY || env.GITHUB_REPOSITORY || "",
    branch: env.BEMSTAT_PURGE_DEFAULT_BRANCH || DEFAULT_BRANCH,
  };

  const targets = purgeTargetsFromValue(env.BEMSTAT_PURGE_TARGETS, defaults);
  const urls = new Set(camoUrlsFromValue(env.BEMSTAT_PURGE_CAMO_URLS));

  for (const target of targets) {
    const pageUrl = readmePageUrl(target);
    log.info?.(`Scanning rendered README page: ${pageUrl}`);
    try {
      const html = await fetchText(fetchImpl, pageUrl);
      for (const url of extractCamoUrls(html)) urls.add(url);
    } catch (error) {
      handleFailure(strict, log, `failed to scan ${pageUrl}: ${messageOf(error)}`);
    }
  }

  if (urls.size === 0) {
    log.info?.("No README camo image URLs found.");
    return { scannedTargets: targets.length, purgedUrls: 0, failedUrls: 0 };
  }
  if (urls.size > MAX_PURGE_URLS) {
    throw new Error(`too many camo URLs to purge: ${urls.size} > ${MAX_PURGE_URLS}`);
  }

  let failedUrls = 0;
  for (const url of urls) {
    log.info?.(`Purging: ${url}`);
    try {
      await purgeUrl(fetchImpl, url);
      log.info?.("Purged.");
    } catch (error) {
      failedUrls += 1;
      handleFailure(strict, log, `failed to purge ${url}: ${messageOf(error)}`);
    }
  }

  return { scannedTargets: targets.length, purgedUrls: urls.size - failedUrls, failedUrls };
}

async function fetchText(fetchImpl, url) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: { "User-Agent": "bemstat-cache-purge" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function purgeUrl(fetchImpl, url) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: "PURGE",
    headers: { "User-Agent": "bemstat-cache-purge" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

async function fetchWithTimeout(fetchImpl, url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function handleFailure(strict, log, message) {
  if (strict) throw new Error(message);
  log.warn?.(`Warning: ${message}`);
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function htmlDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isCamoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "camo.githubusercontent.com";
  } catch {
    return false;
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const result = await purgeFromEnv();
  console.log(`Scanned ${result.scannedTargets} target(s), purged ${result.purgedUrls} URL(s), failed ${result.failedUrls} URL(s).`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  });
}
