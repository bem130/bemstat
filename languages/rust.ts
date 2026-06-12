import {
  addLine,
  addTestCase,
  emptyFileStats,
  isTestPath,
  languageInfo,
  stripLineEnding,
  type ClassifierContext,
  type LanguageClassifier,
  type TextLine,
} from "./types.ts";

const RUST_DOC_RE = /^\s*(\/\/\/|\/\/!)/;
const RUST_COMMENT_RE = /^\s*\/\//;
const RUST_CFG_TEST_RE = /^\s*#\[\s*cfg\s*\(\s*test\s*\)\s*\]/;
const RUST_TEST_ATTR_RE = /^\s*#\[(?:test|tokio::test|wasm_bindgen_test)\b/;
const RUST_FN_RE = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\b/;

export const rustClassifier: LanguageClassifier = {
  id: "rust",
  name: "Rust",

  matches(_relPath: string, context: ClassifierContext): boolean {
    return context.lastExtension === ".rs";
  },

  languageFor() {
    return languageInfo("rust", "Rust");
  },

  classify(relPath: string, lines: readonly TextLine[]) {
    const stats = emptyFileStats();
    const testFile = isTestPath(relPath);
    let braceDepth = 0;
    const testRegionEnds: number[] = [];
    let pendingCfgTest = false;
    let pendingTestAttr = false;

    for (const line of lines) {
      const stripped = stripLineEnding(line.text);
      const logical = stripped.trim();
      const inTestRegion = testFile || testRegionEnds.length > 0;
      const isCfgTest = RUST_CFG_TEST_RE.test(stripped);
      const isTestAttr = RUST_TEST_ATTR_RE.test(stripped);
      const isDoc = RUST_DOC_RE.test(stripped);

      if (logical === "") {
        addLine(stats, "other", line);
      } else if (isCfgTest || isTestAttr) {
        addLine(stats, "test", line);
        if (isCfgTest) pendingCfgTest = true;
        if (isTestAttr) {
          pendingTestAttr = true;
          addTestCase(stats);
        }
      } else if (pendingCfgTest || pendingTestAttr || inTestRegion) {
        addLine(stats, "test", line);
      } else if (isDoc) {
        addLine(stats, "doc_comment", line);
      } else if (RUST_COMMENT_RE.test(stripped)) {
        addLine(stats, "comment", line);
      } else {
        addLine(stats, "source", line);
      }

      const depthBefore = braceDepth;
      const opens = (stripped.match(/{/g) ?? []).length;
      const closes = (stripped.match(/}/g) ?? []).length;

      if (pendingCfgTest && logical !== "" && !isCfgTest) {
        if (stripped.includes("{")) {
          testRegionEnds.push(depthBefore);
          pendingCfgTest = false;
        } else if (stripped.endsWith(";")) {
          pendingCfgTest = false;
        }
      }

      if (pendingTestAttr && logical !== "" && !isTestAttr) {
        if ((RUST_FN_RE.test(stripped) || !stripped.startsWith("#[")) && stripped.includes("{")) {
          testRegionEnds.push(depthBefore);
          pendingTestAttr = false;
        } else if (stripped.endsWith(";")) {
          pendingTestAttr = false;
        }
      }

      braceDepth += opens - closes;
      while (testRegionEnds.length > 0 && braceDepth <= testRegionEnds[testRegionEnds.length - 1]) {
        testRegionEnds.pop();
      }
    }

    return stats;
  },
};
