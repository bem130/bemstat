import assert from "node:assert/strict";
import { neplClassifier } from "../languages/nepl.ts";
import { neplMarkdownClassifier } from "../languages/nepl_markdown.ts";
import { resolveLanguage } from "../languages/registry.ts";
import { rustClassifier } from "../languages/rust.ts";
import type { TextLine } from "../languages/types.ts";

function lines(input: string): TextLine[] {
  return input.split(/(?<=\n)/).filter((line) => line.length > 0).map((text) => ({
    text,
    rawBytes: Buffer.byteLength(text, "utf8"),
  }));
}

{
  const source = [
    "//: This function is documented.",
    "//:| neplg2:test",
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
  assert.equal(stats.test, 5);
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
  const source = [
    "# Guide",
    "",
    "neplg2:test",
    "```neplg2",
    "print 1",
    "```",
  ].join("\n");
  const stats = neplMarkdownClassifier.classify("tutorial/intro.n.md", lines(`${source}\n`), resolveLanguage("tutorial/intro.n.md").context);

  assert.equal(stats.document, 1);
  assert.equal(stats.blank, 1);
  assert.equal(stats.test, 4);
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
  assert.equal(resolveLanguage("src/main.nepl").language.id, "nepl");
  assert.equal(resolveLanguage("guide/tutorial.n.md").language.id, "nepl-markdown");
  assert.equal(resolveLanguage("README.md").language.id, "markdown");
  assert.equal(resolveLanguage("src/lib.rs").language.id, "rust");
  assert.equal(resolveLanguage("src/app.ts").language.id, "typescript");
  assert.equal(resolveLanguage("assets/custom.xyz").language.known, false);
}

console.log("language classifier tests passed");
