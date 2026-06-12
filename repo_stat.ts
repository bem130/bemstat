#!/usr/bin/env node
/// <reference types="node" />

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CONTENT_KINDS, type FileStats, type LineKind, type TextLine, emptyFileStats } from "./languages/types.ts";
import { resolveLanguage, suffixKey } from "./languages/registry.ts";
import { writeStaticCharts } from "./rendering/charts.ts";

type BinaryMode = "skip" | "bytes";

type Args = {
  owners: string[];
  out: string;
  workdir: string;
  includeForks: boolean;
  repoLimit: number | null;
  repos: string[];
  maxBytes: number;
  binary: BinaryMode;
};

type MutableArgs = Args & {
  ownersSpecified: boolean;
};

type GitHubRepo = {
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  clone_url: string;
  default_branch: string;
  fork: boolean;
  archived: boolean;
  language: string | null;
  size: number;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
};

type BucketStats = FileStats & {
  files: number;
};

type ContentKindStats = {
  files: number;
  lines: number;
  chars: number;
  bytes: number;
  testCases: number;
};

type RepoMetric = BucketStats & {
  owner: string;
  repository: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  fork: boolean;
  archived: boolean;
  githubLanguage: string | null;
  githubSizeKb: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  status: "ok" | "error";
  errorStage: string | null;
  errorMessage: string | null;
};

type SkippedFile = {
  owner: string;
  repository: string;
  path: string;
  reason: string;
  bytes?: number;
};

type RepoError = {
  owner: string;
  repository: string;
  stage: string;
  message: string;
};

type UnknownExtension = BucketStats & {
  name: string;
};

const TOP_LEVEL_DOC_TEST_DIRS = new Set(["tests", "test", "tutorials", "doc", "docs", "examples"]);

function emptyBucketStats(): BucketStats {
  return {
    files: 0,
    ...emptyFileStats(),
  };
}

function emptyContentKindStats(): ContentKindStats {
  return {
    files: 0,
    lines: 0,
    chars: 0,
    bytes: 0,
    testCases: 0,
  };
}

function parseArgs(argv: string[]): Args {
  const args: MutableArgs = {
    owners: [],
    out: "docs",
    workdir: "work/repos",
    includeForks: true,
    repoLimit: null,
    repos: [],
    maxBytes: 5_000_000,
    binary: "skip",
    ownersSpecified: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`);
      return argv[++i];
    };

    if (arg === "--owners") {
      args.owners = splitCsv(next());
      args.ownersSpecified = true;
    } else if (arg === "--out") {
      args.out = next();
    } else if (arg === "--workdir") {
      args.workdir = next();
    } else if (arg === "--include-forks") {
      args.includeForks = parseBoolean(next(), "--include-forks");
    } else if (arg === "--repo-limit") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) throw new Error("--repo-limit must be a positive integer");
      args.repoLimit = value;
    } else if (arg === "--repo" || arg === "--repos") {
      args.repos.push(...splitCsv(next()));
    } else if (arg === "--max-bytes") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 0) throw new Error("--max-bytes must be a non-negative integer");
      args.maxBytes = value;
    } else if (arg === "--binary") {
      const value = next();
      if (value !== "skip" && value !== "bytes") throw new Error("--binary must be skip or bytes");
      args.binary = value;
    } else if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (args.owners.length === 0 && args.repos.length === 0) {
    args.owners = ["bem130", "neknaj"];
  }

  const { ownersSpecified: _ownersSpecified, ...publicArgs } = args;
  return publicArgs;
}

function printUsage(): void {
  console.log("Usage: node --experimental-strip-types repo_stat.ts [options]");
  console.log("");
  console.log("Options:");
  console.log("  --owners <a,b>              Owners to scan (default: bem130,neknaj)");
  console.log("  --repo <owner/name>         Specific repository; repeat or comma-separate");
  console.log("  --out <dir>                 Output root (default: docs)");
  console.log("  --workdir <dir>             Clone cache root (default: work/repos)");
  console.log("  --include-forks <bool>      Include forked repos (default: true)");
  console.log("  --repo-limit <n>            Limit selected repos after filtering");
  console.log("  --max-bytes <n>             Skip text counting above this size; 0 disables");
  console.log("  --binary <skip|bytes>       Skip binaries or count file size only");
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value: string, name: string): boolean {
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

async function fetchOwnerRepos(owner: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&page=${page}&type=owner&sort=full_name`;
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${await response.text()}`);
    }
    const pageRepos = (await response.json()) as GitHubRepo[];
    repos.push(...pageRepos);
    if (pageRepos.length < 100) break;
  }
  return repos;
}

async function fetchSpecificRepo(fullName: string): Promise<GitHubRepo> {
  const response = await fetch(`https://api.github.com/repos/${fullName}`, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return (await response.json()) as GitHubRepo;
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "bemstat-stat",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function selectRepos(args: Args): Promise<GitHubRepo[]> {
  const byName = new Map<string, GitHubRepo>();
  const explicitRepoNames = new Set(args.repos.map((repo) => repo.toLowerCase()));

  for (const owner of args.owners) {
    for (const repo of await fetchOwnerRepos(owner)) {
      if (!args.includeForks && repo.fork) continue;
      byName.set(repo.full_name.toLowerCase(), repo);
    }
  }

  for (const fullName of args.repos) {
    const repo = await fetchSpecificRepo(fullName);
    if (!args.includeForks && repo.fork) continue;
    byName.set(repo.full_name.toLowerCase(), repo);
  }

  const repos = Array.from(byName.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (args.repoLimit === null) return repos;

  const explicitRepos = repos.filter((repo) => explicitRepoNames.has(repo.full_name.toLowerCase()));
  const implicitRepos = repos.filter((repo) => !explicitRepoNames.has(repo.full_name.toLowerCase()));
  return [...explicitRepos, ...implicitRepos.slice(0, Math.max(0, args.repoLimit - explicitRepos.length))]
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function run(cmd: string[], cwd: string): string {
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (proc.status !== 0) {
    throw new Error((proc.stderr || proc.stdout || `Command failed: ${cmd.join(" ")}`).trim());
  }
  return proc.stdout ?? "";
}

function runWithRetry(cmd: string[], cwd: string, attempts = 3): string {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return run(cmd, cwd);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) sleepMs(1000 * attempt);
    }
  }
  throw lastError;
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureRepo(repo: GitHubRepo, workdir: string): string {
  const ownerDir = resolve(workdir, repo.owner.login);
  const repoDir = resolve(ownerDir, repo.name);
  mkdirSync(ownerDir, { recursive: true });

  if (!existsSync(repoDir)) {
    runWithRetry(["git", "clone", "--depth", "1", "--branch", repo.default_branch, repo.clone_url, repoDir], process.cwd());
    return repoDir;
  }

  if (!existsSync(resolve(repoDir, ".git"))) {
    throw new Error(`target exists but is not a git repository: ${repoDir}`);
  }

  run(["git", "-C", repoDir, "remote", "set-url", "origin", repo.clone_url], process.cwd());
  runWithRetry(["git", "-C", repoDir, "fetch", "--depth", "1", "origin", repo.default_branch], process.cwd());
  run(["git", "-C", repoDir, "checkout", "-f", "FETCH_HEAD"], process.cwd());
  return repoDir;
}

function listTrackedFiles(repoDir: string): string[] {
  const out = run(["git", "-C", repoDir, "ls-files", "-z"], process.cwd());
  return out.split("\0").map((item) => item.trim()).filter(Boolean);
}

function isProbablyBinary(path: string, sampleSize = 8192): boolean {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(sampleSize);
    const bytesRead = readSync(fd, buf, 0, sampleSize, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(fd);
  }
}

function readTextLines(path: string, maxBytes: number | null): TextLine[] {
  const raw = readFileSync(path);
  if (maxBytes !== null && maxBytes > 0 && raw.length > maxBytes) {
    throw new Error(`file too large (${raw.length} bytes) > maxBytes`);
  }

  const rawLines = raw.toString("binary").match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  const textLines = raw.toString("utf8").match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  const lines: TextLine[] = [];
  const count = Math.max(rawLines.length, textLines.length);

  for (let i = 0; i < count; i++) {
    const rawLine = rawLines[i] ?? "";
    const textLine = textLines[i] ?? "";
    if (i === count - 1 && rawLine === "" && textLine === "") continue;
    lines.push({ text: textLine, rawBytes: Buffer.byteLength(rawLine, "binary") });
  }

  return lines;
}

function classifyArea(relPath: string): string {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length === 0) return "other";
  if (TOP_LEVEL_DOC_TEST_DIRS.has(parts[0])) return "top_level_docs_tests";
  if (parts[0] === "src" || parts[0] === "stdlib" || parts.includes("src")) return "source_tree";
  return "other";
}

function accumulateBucket(dest: BucketStats, src: FileStats): void {
  dest.lines += src.lines;
  dest.chars += src.chars;
  dest.bytes += src.bytes;
  dest.blank += src.blank;
  dest.source += src.source;
  dest.doc_comment += src.doc_comment;
  dest.document += src.document;
  dest.data += src.data;
  dest.test += src.test;
  dest.comment += src.comment;
  dest.other += src.other;
  dest.testCases += src.testCases;
  for (const kind of CONTENT_KINDS) {
    dest.kindChars[kind] += src.kindChars[kind];
    dest.kindBytes[kind] += src.kindBytes[kind];
  }
}

function addFileToBucket(map: Map<string, BucketStats>, key: string, stats: FileStats): void {
  const bucket = ensureBucket(map, key);
  bucket.files += 1;
  accumulateBucket(bucket, stats);
}

function ensureBucket(map: Map<string, BucketStats>, key: string): BucketStats {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = emptyBucketStats();
    map.set(key, bucket);
  }
  return bucket;
}

function ensureContentKindBucket(map: Map<LineKind, ContentKindStats>, key: LineKind): ContentKindStats {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = emptyContentKindStats();
    map.set(key, bucket);
  }
  return bucket;
}

function sortedBucketEntries(map: Map<string, BucketStats>): Array<[string, BucketStats]> {
  return Array.from(map.entries()).sort((a, b) => {
    if (isUnknownName(a[0]) !== isUnknownName(b[0])) return isUnknownName(a[0]) ? 1 : -1;
    if (b[1].source !== a[1].source) return b[1].source - a[1].source;
    return a[0].localeCompare(b[0]);
  });
}

function isUnknownName(name: string): boolean {
  return name === "unknown" || name === "(no_ext)" || name.startsWith("unknown:");
}

function bucketPayload(name: string, stats: BucketStats): { name: string } & BucketStats {
  return { name, ...stats };
}

function contentKindPayload(name: LineKind, stats: ContentKindStats): { name: LineKind } & ContentKindStats {
  return { name, ...stats };
}

async function buildStat(args: Args) {
  const repos = await selectRepos(args);
  const totals = emptyBucketStats();
  const byOwner = new Map<string, BucketStats>();
  const byRepository = new Map<string, RepoMetric>();
  const byExtension = new Map<string, BucketStats>();
  const byLanguage = new Map<string, BucketStats>();
  const byArea = new Map<string, BucketStats>();
  const byContentKind = new Map<LineKind, ContentKindStats>();
  const unknownExtensions = new Map<string, BucketStats>();
  const skipped: SkippedFile[] = [];
  const errors: RepoError[] = [];
  const maxBytes = args.maxBytes === 0 ? null : args.maxBytes;

  for (const repo of repos) {
    console.log(`Scanning ${repo.full_name}`);
    const repoStats: RepoMetric = {
      owner: repo.owner.login,
      repository: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      fork: repo.fork,
      archived: repo.archived,
      githubLanguage: repo.language,
      githubSizeKb: repo.size,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
      status: "ok",
      errorStage: null,
      errorMessage: null,
      ...emptyBucketStats(),
    };
    byRepository.set(repo.full_name, repoStats);

    let repoDir: string;
    try {
      repoDir = ensureRepo(repo, args.workdir);
    } catch (error) {
      const record = errorRecord(repo, "sync", error);
      markRepoError(repoStats, record);
      errors.push(record);
      continue;
    }

    let files: string[];
    try {
      files = listTrackedFiles(repoDir);
    } catch (error) {
      const record = errorRecord(repo, "list-files", error);
      markRepoError(repoStats, record);
      errors.push(record);
      continue;
    }

    for (const relPath of files) {
      const absPath = resolve(repoDir, relPath);
      let size = 0;
      try {
        const stat = lstatSync(absPath);
        if (stat.isSymbolicLink()) {
          skipped.push(skippedRecord(repo, relPath, "symlink", stat.size));
          continue;
        }
        if (!stat.isFile()) continue;
        size = stat.size;
      } catch (error) {
        skipped.push(skippedRecord(repo, relPath, "unreadable", undefined));
        continue;
      }

      const ext = suffixKey(relPath);
      const area = classifyArea(relPath);
      const resolved = resolveLanguage(relPath);
      const languageKey = resolved.language.id;
      let binaryFile: boolean;
      try {
        binaryFile = isProbablyBinary(absPath);
      } catch (error) {
        skipped.push(skippedRecord(repo, relPath, "unreadable", size));
        continue;
      }

      if (binaryFile) {
        if (args.binary === "skip") {
          skipped.push(skippedRecord(repo, relPath, "binary", size));
          continue;
        }
        const binaryStats = emptyFileStats();
        binaryStats.bytes = size;
        addMeasuredFile(repoStats, totals, byOwner, byExtension, byLanguage, byArea, unknownExtensions, repo, ext, area, languageKey, !resolved.language.known, binaryStats);
        continue;
      }

      if (maxBytes !== null && maxBytes > 0 && size > maxBytes) {
        skipped.push(skippedRecord(repo, relPath, "too_large", size));
        continue;
      }

      let fileStats: FileStats;
      try {
        const lines = readTextLines(absPath, maxBytes);
        fileStats = resolved.classifier.classify(relPath, lines, resolved.context);
      } catch (error) {
        skipped.push(skippedRecord(repo, relPath, error instanceof Error && error.message.includes("too large") ? "too_large" : "unreadable", size));
        continue;
      }

      addMeasuredFile(repoStats, totals, byOwner, byExtension, byLanguage, byArea, unknownExtensions, repo, ext, area, languageKey, !resolved.language.known, fileStats);

      for (const kind of CONTENT_KINDS) {
        const count = fileStats[kind];
        if (count <= 0) continue;
        const kindBucket = ensureContentKindBucket(byContentKind, kind);
        kindBucket.files += 1;
        kindBucket.lines += count;
        kindBucket.chars += fileStats.kindChars[kind];
        kindBucket.bytes += fileStats.kindBytes[kind];
        kindBucket.testCases += kind === "test" ? fileStats.testCases : 0;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    owners: args.owners,
    repositoryCount: repos.length,
    repositories: repos.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      fork: repo.fork,
      archived: repo.archived,
      githubLanguage: repo.language,
      githubSizeKb: repo.size,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
    })),
    totals,
    byOwner: sortedBucketEntries(byOwner).map(([name, stats]) => bucketPayload(name, stats)),
    byRepository: Array.from(byRepository.values()).sort((a, b) => {
      if (a.status !== b.status) return a.status === "error" ? 1 : -1;
      return b.source - a.source || a.fullName.localeCompare(b.fullName);
    }),
    byExtension: sortedBucketEntries(byExtension).map(([name, stats]) => bucketPayload(name, stats)),
    byLanguage: sortedBucketEntries(byLanguage).map(([name, stats]) => bucketPayload(name, stats)),
    byArea: sortedBucketEntries(byArea).map(([name, stats]) => bucketPayload(name, stats)),
    byContentKind: Array.from(byContentKind.entries()).sort((a, b) => CONTENT_KINDS.indexOf(a[0]) - CONTENT_KINDS.indexOf(b[0])).map(([name, stats]) => contentKindPayload(name, stats)),
    skipped,
    errors,
    unknownExtensions: sortedBucketEntries(unknownExtensions).map(([name, stats]) => ({ name, ...stats }) satisfies UnknownExtension),
  };
}

function markRepoError(repoStats: RepoMetric, error: RepoError): void {
  repoStats.status = "error";
  repoStats.errorStage = error.stage;
  repoStats.errorMessage = error.message;
}

function addMeasuredFile(
  repoStats: RepoMetric,
  totals: BucketStats,
  byOwner: Map<string, BucketStats>,
  byExtension: Map<string, BucketStats>,
  byLanguage: Map<string, BucketStats>,
  byArea: Map<string, BucketStats>,
  unknownExtensions: Map<string, BucketStats>,
  repo: GitHubRepo,
  ext: string,
  area: string,
  languageKey: string,
  unknownLanguage: boolean,
  stats: FileStats,
): void {
  repoStats.files += 1;
  accumulateBucket(repoStats, stats);
  totals.files += 1;
  accumulateBucket(totals, stats);
  addFileToBucket(byOwner, repo.owner.login, stats);
  addFileToBucket(byExtension, ext, stats);
  addFileToBucket(byLanguage, languageKey, stats);
  addFileToBucket(byArea, area, stats);
  if (unknownLanguage) {
    addFileToBucket(unknownExtensions, ext, stats);
  }
}

function errorRecord(repo: GitHubRepo, stage: string, error: unknown): RepoError {
  return {
    owner: repo.owner.login,
    repository: repo.name,
    stage,
    message: String(error instanceof Error ? error.message : error),
  };
}

function skippedRecord(repo: GitHubRepo, path: string, reason: string, bytes?: number): SkippedFile {
  return {
    owner: repo.owner.login,
    repository: repo.name,
    path,
    reason,
    ...(bytes === undefined ? {} : { bytes }),
  };
}

function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeCsv(path: string, stat: Awaited<ReturnType<typeof buildStat>>): void {
  mkdirSync(dirname(path), { recursive: true });
  const rows: string[] = [];
  rows.push([
    "section",
    "owner",
    "repository",
    "name",
    "language",
    "files",
    "lines",
    "chars",
    "bytes",
    "blank",
    "source",
    "doc_comment",
    "document",
    "data",
    "test",
    "comment",
    "other",
    "test_cases",
  ].join(","));

  for (const item of stat.byOwner) {
    rows.push(csvBucketRow("owner", item.name, "", item.name, "", item));
  }
  for (const item of stat.byRepository) {
    rows.push(csvBucketRow("repository", item.owner, item.repository, item.fullName, item.githubLanguage ?? "", item));
  }
  for (const item of stat.byExtension) {
    rows.push(csvBucketRow("extension", "", "", item.name, "", item));
  }
  for (const item of stat.byLanguage) {
    rows.push(csvBucketRow("language", "", "", item.name, item.name, item));
  }
  for (const item of stat.byArea) {
    rows.push(csvBucketRow("area", "", "", item.name, "", item));
  }
  for (const item of stat.byContentKind) {
    const stats = contentKindAsBucket(item.name, item);
    rows.push(csvBucketRow("content_kind", "", "", item.name, "", stats));
  }

  writeFileSync(path, `${rows.join("\n")}\n`, "utf8");
}

function contentKindAsBucket(kind: LineKind, stats: ContentKindStats): BucketStats {
  const bucket = emptyBucketStats();
  bucket.files = stats.files;
  bucket.lines = stats.lines;
  bucket.chars = stats.chars;
  bucket.bytes = stats.bytes;
  bucket.testCases = stats.testCases;
  bucket[kind] = stats.lines;
  return bucket;
}

function csvBucketRow(section: string, owner: string, repository: string, name: string, language: string, stats: BucketStats): string {
  return [
    section,
    owner,
    repository,
    name,
    language,
    stats.files,
    stats.lines,
    stats.chars,
    stats.bytes,
    stats.blank,
    stats.source,
    stats.doc_comment,
    stats.document,
    stats.data,
    stats.test,
    stats.comment,
    stats.other,
    stats.testCases,
  ].map((value) => csvEsc(String(value))).join(",");
}

function csvEsc(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = resolve(args.out);
  const statDir = resolve(outRoot, "stat");
  const stat = await buildStat(args);
  writeJson(resolve(statDir, "repo_stat.json"), stat);
  writeCsv(resolve(statDir, "repo_stat.csv"), stat);
  const charts = writeStaticCharts(stat, outRoot);
  console.log(`Wrote ${resolve(statDir, "repo_stat.json")}`);
  console.log(`Wrote ${resolve(statDir, "repo_stat.csv")}`);
  console.log(`Wrote ${charts.length} chart files`);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
