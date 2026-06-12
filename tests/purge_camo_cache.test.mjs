import assert from "node:assert/strict";
import {
  camoUrlsFromValue,
  extractCamoUrls,
  listValues,
  parseBoolean,
  purgeFromEnv,
  purgeTargetsFromValue,
  readmePageUrl,
} from "../scripts/purge_camo_cache.mjs";

{
  assert.deepEqual(listValues("README.md\n# comment\nbem130/bem130@main:README.md, docs/README.md"), [
    "README.md",
    "bem130/bem130@main:README.md",
    "docs/README.md",
  ]);
  assert.equal(parseBoolean("true"), true);
  assert.equal(parseBoolean("yes"), true);
  assert.equal(parseBoolean("false"), false);
  assert.equal(parseBoolean(""), false);
}

{
  const defaults = { repository: "bem130/bemstat", branch: "main" };
  assert.deepEqual(purgeTargetsFromValue("", defaults), [
    { repository: "bem130/bemstat", branch: "main", path: "README.md" },
  ]);
  assert.deepEqual(purgeTargetsFromValue("docs/README.md\nbem130/bem130@profile:README.md", defaults), [
    { repository: "bem130/bemstat", branch: "main", path: "docs/README.md" },
    { repository: "bem130/bem130", branch: "profile", path: "README.md" },
  ]);
  assert.equal(
    readmePageUrl({ repository: "bem130/bemstat", branch: "main", path: "docs/README.md" }),
    "https://github.com/bem130/bemstat/blob/main/docs/README.md",
  );
  assert.throws(() => purgeTargetsFromValue("../README.md", defaults), /invalid purge path/);
  assert.throws(() => purgeTargetsFromValue("https://example.test/README.md", defaults), /invalid purge path/);
  assert.throws(() => purgeTargetsFromValue("bad repo@main:README.md", defaults), /invalid purge path/);
}

{
  const html = `
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://camo.githubusercontent.com/darkhash/68747470733a2f2f6578616d706c652e746573742f6461726b2e737667 1x, https://example.test/ignored.svg 2x">
      <img src="https://camo.githubusercontent.com/lighthash/68747470733a2f2f6578616d706c652e746573742f6c696768742e737667?raw=1&amp;token=x" alt="chart">
    </picture>
  `;
  assert.deepEqual(Array.from(extractCamoUrls(html)), [
    "https://camo.githubusercontent.com/darkhash/68747470733a2f2f6578616d706c652e746573742f6461726b2e737667",
    "https://camo.githubusercontent.com/lighthash/68747470733a2f2f6578616d706c652e746573742f6c696768742e737667?raw=1&token=x",
  ]);
  assert.deepEqual(camoUrlsFromValue("https://camo.githubusercontent.com/direct/hash"), ["https://camo.githubusercontent.com/direct/hash"]);
  assert.throws(() => camoUrlsFromValue("https://example.test/not-camo"), /invalid direct camo URL/);
}

{
  const calls = [];
  const html = '<source srcset="https://camo.githubusercontent.com/source/hash 1x"><img src="https://camo.githubusercontent.com/img/hash">';
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (init.method === "PURGE") {
      return { ok: true, status: 200, statusText: "OK" };
    }
    return { ok: true, status: 200, statusText: "OK", text: async () => html };
  };
  const logs = [];
  const result = await purgeFromEnv({
    BEMSTAT_PURGE_TARGETS: "README.md,bem130/bem130@main:README.md",
    BEMSTAT_PURGE_CAMO_URLS: "https://camo.githubusercontent.com/direct/hash",
    BEMSTAT_PURGE_DEFAULT_REPOSITORY: "bem130/bemstat",
    BEMSTAT_PURGE_DEFAULT_BRANCH: "main",
  }, {
    fetchImpl,
    log: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  });

  assert.deepEqual(result, { scannedTargets: 2, purgedUrls: 3, failedUrls: 0 });
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET", "PURGE", "PURGE", "PURGE"]);
  assert.equal(calls[0].url, "https://github.com/bem130/bemstat/blob/main/README.md");
  assert.equal(calls[1].url, "https://github.com/bem130/bem130/blob/main/README.md");
}

{
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "PURGE") {
      return { ok: false, status: 500, statusText: "Server Error" };
    }
    return { ok: true, status: 200, statusText: "OK", text: async () => '<img src="https://camo.githubusercontent.com/img/hash">' };
  };
  const soft = await purgeFromEnv({
    BEMSTAT_PURGE_TARGETS: "README.md",
    BEMSTAT_PURGE_DEFAULT_REPOSITORY: "bem130/bemstat",
  }, {
    fetchImpl,
    log: { info: () => {}, warn: () => {} },
  });
  assert.deepEqual(soft, { scannedTargets: 1, purgedUrls: 0, failedUrls: 1 });

  await assert.rejects(
    () => purgeFromEnv({
      BEMSTAT_PURGE_TARGETS: "README.md",
      BEMSTAT_PURGE_STRICT: "true",
      BEMSTAT_PURGE_DEFAULT_REPOSITORY: "bem130/bemstat",
    }, {
      fetchImpl,
      log: { info: () => {}, warn: () => {} },
    }),
    /failed to purge/,
  );
}

console.log("purge camo cache tests passed");
