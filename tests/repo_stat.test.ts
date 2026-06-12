import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addFileToContentKind,
  assertSafeGitMetadata,
  assertSafeStatDir,
  classifyArea,
  csvEsc,
  hasNextPage,
  publicErrorMessage,
  resolveWorkspacePath,
  safeResolveRepoPath,
  sortedBucketEntries,
  sortedRepositoryMetrics,
  writeCsv,
} from "../repo_stat.ts";
import { writeStaticCharts } from "../rendering/charts.ts";
import { emptyFileStats, type LineKind } from "../languages/types.ts";

function bucket(overrides = {}) {
  return {
    files: 1,
    ...emptyFileStats(),
    ...overrides,
  };
}

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

{
  assert.equal(csvEsc("plain"), "plain");
  assert.equal(csvEsc("a,b"), "\"a,b\"");
  assert.equal(csvEsc("=cmd"), "'=cmd");
  assert.equal(csvEsc("+cmd"), "'+cmd");
  assert.equal(csvEsc("-cmd"), "'-cmd");
  assert.equal(csvEsc("@cmd"), "'@cmd");
}

{
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "secret-token";
  const message = publicErrorMessage("Bearer secret-token https://user:pass@example.test/repo.git ghp_abcdefghijklmnopqrstuvwxyz012345");
  if (previousToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = previousToken;
  }

  assert.equal(message.includes("secret-token"), false);
  assert.equal(message.includes("user:pass"), false);
  assert.equal(message.includes("ghp_"), false);
}

{
  const message = publicErrorMessage(`target exists but is not a git repository: ${resolve("work/repos/example/repo")}`);

  assert.equal(message.includes(resolve("work")), false);
  assert.match(message, /\[workspace\]/);
}

{
  assert.equal(hasNextPage(null), false);
  assert.equal(hasNextPage("<https://api.github.com/users/example/repos?page=2>; rel=\"next\", <https://api.github.com/users/example/repos?page=3>; rel=\"last\""), true);
  assert.equal(hasNextPage("<https://api.github.com/users/example/repos?page=1>; rel=\"prev\", <https://api.github.com/users/example/repos?page=3>; rel=\"last\""), false);
}

{
  const repoDir = resolve("work/repos/example/repo");
  assert.equal(safeResolveRepoPath(repoDir, "src/lib.rs"), resolve(repoDir, "src/lib.rs"));
  assert.throws(() => safeResolveRepoPath(repoDir, "../escape"), /escapes checkout/);
  assert.throws(() => safeResolveRepoPath(repoDir, resolve("outside.txt")), /absolute repository path/);
}

{
  mkdirSync("work", { recursive: true });
  const repoDir = mkdtempSync(join(resolve("work"), "git-safe-"));
  try {
    mkdirSync(join(repoDir, ".git"));
    assert.doesNotThrow(() => assertSafeGitMetadata(repoDir));
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

{
  const repoDir = mkdtempSync(join(resolve("work"), "git-file-"));
  const outsideGit = mkdtempSync(join(tmpdir(), "bemstat-gitdir-"));
  try {
    writeFileSync(join(repoDir, ".git"), `gitdir: ${outsideGit}\n`, "utf8");
    assert.throws(() => assertSafeGitMetadata(repoDir), /git metadata escapes repository/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(outsideGit, { recursive: true, force: true });
  }
}

{
  const repoDir = mkdtempSync(join(resolve("work"), "git-link-"));
  const outsideGit = mkdtempSync(join(tmpdir(), "bemstat-gitlink-"));
  try {
    symlinkSync(outsideGit, join(repoDir, ".git"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertSafeGitMetadata(repoDir), /git metadata escapes repository/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(outsideGit, { recursive: true, force: true });
  }
}

{
  assert.equal(resolveWorkspacePath("docs", "--out"), resolve("docs"));
  assert.throws(() => resolveWorkspacePath("../outside", "--out"), /must stay inside the workspace/);
}

{
  assert.equal(classifyArea("Tests/sample.ts"), "top_level_docs_tests");
  assert.equal(classifyArea("Docs/guide.md"), "top_level_docs_tests");
  assert.equal(classifyArea("Lib/SRC/main.ts"), "source_tree");
}

{
  const root = mkdtempSync(join(resolve("work"), "stat-safe-"));
  try {
    assert.doesNotThrow(() => assertSafeStatDir(root, join(root, "stat")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(resolve("work"), "stat-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "bemstat-outside-"));
  try {
    symlinkSync(outside, join(root, "stat"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertSafeStatDir(root, join(root, "stat")), /unsafe stat output directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

{
  const stats = emptyFileStats();
  stats.bytes = 42;
  stats.kindBytes.data = 42;
  const map = new Map<LineKind, { files: number; lines: number; chars: number; bytes: number; testCases: number }>();
  addFileToContentKind(map, "data", stats);
  assert.deepEqual(map.get("data"), { files: 1, lines: 0, chars: 0, bytes: 42, testCases: 0 });
}

{
  const dir = mkdtempSync(join(tmpdir(), "bemstat-"));
  try {
    const csvPath = join(dir, "repo_stat.csv");
    const unknownStats = bucket({ lines: 1, other: 1 });
    writeCsv(csvPath, {
      byOwner: [],
      byRepository: [],
      byExtension: [],
      byLanguage: [],
      byArea: [],
      byContentKind: [],
      unknownExtensions: [{ name: ".zzz", ...unknownStats }],
    });
    const csv = readFileSync(csvPath, "utf8");
    assert.match(csv, /^unknown_extension,,,.zzz,,1,1,/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(resolve("work"), "chart-font-"));
  const longRepo = "bem130/WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW";
  try {
    const written = writeStaticCharts({
      owners: ["bem130", "neknaj"],
      byOwner: [{ name: "bem130", files: 1, lines: 100, bytes: 100, source: 100 }],
      byRepository: [{ fullName: longRepo, files: 1, lines: 1_234_567_890_123, bytes: 100, source: 1_234_567_890_123 }],
      byExtension: [{ name: ".very-long-extension-name", files: 1, lines: 100, bytes: 100, source: 100 }],
      byLanguage: [{ name: "TypeScriptWithAVeryLongName", files: 1, lines: 100, bytes: 100, source: 100 }],
      byContentKind: [{ name: "source", files: 1, lines: 100, bytes: 100 }],
    }, root);
    assert.equal(written.length, 20);

    const svg = readFileSync(join(root, "stat", "images", "top-repositories-by-source-lines-dark.svg"), "utf8");
    assert.match(svg, /<svg [^>]*width="1080"/);
    assert.match(svg, /<clipPath id="labelClip">/);
    assert.match(svg, /<rect x="40" y="0" width="656"/);
    assert.match(svg, /\.label \{ font-size: 46px; font-weight: 700;/);
    assert.match(svg, /\.value \{ font-size: 38px; font-weight: 700;/);
    assert.match(svg, /<text x="40" y="\d+" class="label" clip-path="url\(#labelClip\)">bem130\/WWWWWWWWW\.\.\.<\/text>/);
    assert.doesNotMatch(svg, new RegExp(longRepo));
    assert.match(svg, /<text x="1040" y="\d+" text-anchor="end" class="value">1,234,567,890,123<\/text>/);

    const size = pngSize(join(root, "stat", "images", "top-repositories-by-source-lines-dark.png"));
    assert.equal(size.width, 1080);
    assert.ok(size.height > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const entries = sortedBucketEntries(new Map([
    ["unknown", bucket({ source: 999 })],
    ["typescript", bucket({ source: 10 })],
    ["rust", bucket({ source: 20 })],
  ]));
  assert.deepEqual(entries.map(([name]) => name), ["rust", "typescript", "unknown"]);
}

{
  const repo = (fullName: string, source: number, status = "ok") => ({
    owner: fullName.split("/")[0],
    repository: fullName.split("/")[1],
    fullName,
    htmlUrl: "",
    defaultBranch: "main",
    fork: false,
    archived: false,
    githubLanguage: null,
    githubSizeKb: 0,
    createdAt: "",
    updatedAt: "",
    pushedAt: null,
    status,
    errorStage: null,
    errorMessage: null,
    ...bucket({ source }),
  });
  assert.deepEqual(
    sortedRepositoryMetrics([
      repo("owner/error", 999, "error"),
      repo("owner/small", 1),
      repo("owner/large", 10),
    ]).map((item) => item.fullName),
    ["owner/large", "owner/small", "owner/error"],
  );
}

console.log("repo_stat tests passed");
