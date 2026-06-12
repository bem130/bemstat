import assert from "node:assert/strict";
import { genericClassifier } from "../languages/generic.ts";
import { neplClassifier } from "../languages/nepl.ts";
import { neplMarkdownClassifier } from "../languages/nepl_markdown.ts";
import { resolveLanguage } from "../languages/registry.ts";
import { rustClassifier } from "../languages/rust.ts";
import type { LineKind, TextLine } from "../languages/types.ts";

function lines(input: string): TextLine[] {
  return input.split(/(?<=\n)/).filter((line) => line.length > 0).map((text) => ({
    text,
    rawBytes: Buffer.byteLength(text, "utf8"),
  }));
}

function classify(path: string, input = "value\n") {
  const resolved = resolveLanguage(path);
  return {
    resolved,
    stats: resolved.classifier.classify(path, lines(input), resolved.context),
  };
}

function assertClassifiedAs(path: string, kind: LineKind, input = "value\n"): void {
  const { resolved, stats } = classify(path, input);
  assert.equal(resolved.language.known, true, path);
  assert.equal(stats[kind], 1, path);
  for (const candidate of ["source", "document", "data", "test", "comment", "doc_comment", "other"] as const) {
    if (candidate !== kind) assert.equal(stats[candidate], 0, `${path} ${candidate}`);
  }
}

{
  const source = [
    "//: This function is documented.",
    "//:| neplg2:test",
    "//: exit_code: 0",
    "//: stdin: 1",
    "//:| ```neplg2",
    "//:| add 1 2",
    "//:| ```",
    "fn main:",
    "  add 1 2",
    "// regular comment",
  ].join("\n");
  const stats = neplClassifier.classify("src/sample.nepl", lines(`${source}\n`), resolveLanguage("src/sample.nepl").context);

  assert.equal(stats.doc_comment, 1);
  assert.equal(stats.test, 6);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 2);
  assert.equal(stats.comment, 1);
}

{
  const source = [
    "//: documentation in a test file",
    "helper 1",
  ].join("\n");
  const stats = neplClassifier.classify("tests/sample.nepl", lines(`${source}\n`), resolveLanguage("tests/sample.nepl").context);

  assert.equal(stats.doc_comment, 0);
  assert.equal(stats.test, 2);
}

{
  const { stats } = classify("src/app.ts", "/**/\nconst value = 1;\n");

  assert.equal(stats.doc_comment, 1);
  assert.equal(stats.source, 1);
}

{
  const { stats } = classify("index.html", "<!---->\n<div></div>\n");

  assert.equal(stats.comment, 1);
  assert.equal(stats.source, 1);
}

{
  const { stats } = classify("src/app.ts", "/*/\nconst value = 1;\n");

  assert.equal(stats.comment, 2);
  assert.equal(stats.source, 0);
}

{
  const { stats } = classify("index.html", "<!-->\n<div></div>\n");

  assert.equal(stats.comment, 2);
  assert.equal(stats.source, 0);
}

{
  assert.equal(classify("Tests/app.ts").stats.test, 1);
  assert.equal(classify("src/__tests__/app.ts").stats.test, 1);
  assert.equal(classify("spec/app.ts").stats.test, 1);
}

{
  const source = [
    "# Guide",
    "",
    "neplg2:test",
    "exit_code: 0",
    "```neplg2",
    "print 1",
    "```",
  ].join("\n");
  const stats = neplMarkdownClassifier.classify("tutorial/intro.n.md", lines(`${source}\n`), resolveLanguage("tutorial/intro.n.md").context);

  assert.equal(stats.document, 1);
  assert.equal(stats.blank, 1);
  assert.equal(stats.test, 5);
  assert.equal(stats.testCases, 1);
}

{
  const source = [
    "/// Adds values.",
    "#[test]",
    "fn adds() {",
    "  /// doc in test",
    "  assert_eq!(1 + 1, 2);",
    "}",
    "fn prod() {",
    "  // comment",
    "}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.doc_comment, 1);
  assert.equal(stats.test, 5);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 2);
  assert.equal(stats.comment, 1);
}

{
  const source = [
    "/// module docs in a test path",
    "fn helper() {}",
  ].join("\n");
  const stats = rustClassifier.classify("tests/lib.rs", lines(`${source}\n`), resolveLanguage("tests/lib.rs").context);

  assert.equal(stats.doc_comment, 0);
  assert.equal(stats.test, 2);
}

{
  const source = [
    "#[test] fn inline_test() { assert!(true); }",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 1);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "/** public docs */",
    "/* implementation note */",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.doc_comment, 1);
  assert.equal(stats.comment, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "/*",
    "#[test]",
    "*/",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.comment, 3);
  assert.equal(stats.test, 0);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "/* outer /* inner */",
    "#[test]",
    "*/",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.comment, 3);
  assert.equal(stats.test, 0);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "#[test] fn keeps_region_open() { /* } */",
    "  assert!(true);",
    "}",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 3);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "#[test] fn string_markers_do_not_open_comments() { let a = \"/*\"; let b = \"https://example.test\"; }",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 1);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "#[test] fn raw_string_markers_do_not_count_braces() { let s = r#\"/* } */\"#; }",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 1);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "#[test] fn multiline_string_markers_do_not_count_braces() { let s = \"",
    "}",
    "\"; }",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 3);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  const source = [
    "#[test] fn multiline_raw_string_markers_do_not_count_braces() { let s = r#\"",
    "}",
    "\"#; }",
    "fn prod() {}",
  ].join("\n");
  const stats = rustClassifier.classify("src/lib.rs", lines(`${source}\n`), resolveLanguage("src/lib.rs").context);

  assert.equal(stats.test, 3);
  assert.equal(stats.testCases, 1);
  assert.equal(stats.source, 1);
}

{
  assert.equal(resolveLanguage("src/main.nepl").language.id, "nepl");
  assert.equal(resolveLanguage("guide/tutorial.n.md").language.id, "nepl-markdown");
  assert.equal(resolveLanguage("README.md").language.id, "markdown");
  assert.equal(resolveLanguage("src/lib.rs").language.id, "rust");
  assert.equal(resolveLanguage("src/app.ts").language.id, "typescript");
  assert.equal(resolveLanguage("assets/custom.xyz").language.known, false);
}

{
  for (const path of ["data/model.stl", "config/app.json", "layout/view.xml"]) {
    const { stats } = classify(path);
    assert.equal(stats.data, 1, path);
    assert.equal(stats.source, 0, path);
  }

  const { stats: jsonTestStats } = classify("tests/fixtures/case.json", "{}\n");
  assert.equal(jsonTestStats.data, 1);
  assert.equal(jsonTestStats.test, 0);

  const { stats: ncgTestStats } = classify("archive/test.ncg.test.ts_", "it('x', () => {})\n");
  assert.equal(ncgTestStats.test, 1);
  assert.equal(ncgTestStats.source, 0);
}

{
  for (const path of [
    "src/math.asm",
    "script/run.bat",
    "node_modules/.bin/tool.cmd",
    "node_modules/.bin/tool",
    "Dockerfile",
    "makefile",
    "postcss.config.cjs",
    "shader/debug_pattern.frag",
    "shader/fullscreen.vert",
    "src/module.ll",
    "src/goal.nl",
    "src/code.nlac",
    "src/target.nlpc",
    "queries/brackets.scm",
    "src/sample.sk",
  ]) {
    assertClassifiedAs(path, "source");
  }

  for (const path of [
    ".htaccess",
    ".idea/module.iml",
    "config/app.ini",
    "vendor/.keep",
    "Platforms/Windows/app.manifest",
    "typing/sample.ntd",
    "UserSettings/Search.settings",
    "manifest.webmanifest",
    ".vscodeignore",
    ".lightning_studio/.studiorc",
    "font.woff2",
    "archive/tool.zip",
    "shader/fullscreen.vert.spv",
  ]) {
    assertClassifiedAs(path, "data");
  }

  assertClassifiedAs("font_data/image/1-input.pdf", "document");
  assertClassifiedAs("LICENSE", "document");
}

{
  const { stats: tsStats } = classify("src/app.ts", [
    "/// public API",
    "// implementation note",
    "const value = 1;",
  ].join("\n") + "\n");
  assert.equal(tsStats.doc_comment, 1);
  assert.equal(tsStats.comment, 1);
  assert.equal(tsStats.source, 1);

  const { stats: testStats } = classify("tests/app.ts", [
    "/// public API",
    "const value = 1;",
  ].join("\n") + "\n");
  assert.equal(testStats.test, 2);
  assert.equal(testStats.doc_comment, 0);

  const { stats: customStats } = classify("src/sample.sk", [
    "// comment",
    "$ (K x y) = x",
  ].join("\n") + "\n");
  assert.equal(customStats.comment, 1);
  assert.equal(customStats.source, 1);

  const { stats: batchStats } = classify("run.bat", [
    "@rem note",
    "dotnet run",
  ].join("\n") + "\n");
  assert.equal(batchStats.comment, 1);
  assert.equal(batchStats.source, 1);
}

{
  const { resolved, stats } = classify("assets/custom.xyz");
  assert.equal(resolved.language.known, false);
  assert.equal(resolved.classifier.id, genericClassifier.id);
  assert.equal(stats.other, 1);

  const { stats: unknownTestStats } = classify("tests/custom.xyz");
  assert.equal(unknownTestStats.test, 1);
}

console.log("language classifier tests passed");
