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
const RUST_DOC_BLOCK_RE = /^\s*\/\*(?:\*|!)/;
const RUST_BLOCK_RE = /^\s*\/\*/;

type BraceScanState = {
  blockDepth: number;
  string: { kind: "quoted"; quote: "\"" } | { kind: "raw"; hashes: number } | null;
};

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
    let blockCommentKind: "comment" | "doc_comment" | null = null;
    let blockCommentDepth = 0;
    let braceScanState: BraceScanState = { blockDepth: 0, string: null };

    for (const line of lines) {
      const stripped = stripLineEnding(line.text);
      const logical = stripped.trim();
      const braceScan = codeForBraceCount(stripped, braceScanState);
      braceScanState = braceScan.state;
      const braceCode = braceScan.code;
      const braceLogical = braceCode.trim();
      const inTestRegion = testFile || testRegionEnds.length > 0 || pendingCfgTest || pendingTestAttr;
      const isCfgTest = RUST_CFG_TEST_RE.test(stripped);
      const isTestAttr = RUST_TEST_ATTR_RE.test(stripped);
      const isDoc = RUST_DOC_RE.test(stripped);

      if (logical === "") {
        addLine(stats, "other", line);
      } else if (blockCommentKind !== null) {
        addLine(stats, blockCommentKind, line);
        blockCommentDepth = updateBlockCommentDepth(stripped, blockCommentDepth);
        if (blockCommentDepth === 0) blockCommentKind = null;
      } else if (isCfgTest || isTestAttr) {
        addLine(stats, "test", line);
        if (isCfgTest) pendingCfgTest = true;
        if (isTestAttr) {
          pendingTestAttr = true;
          addTestCase(stats);
        }
      } else if (inTestRegion) {
        addLine(stats, "test", line);
      } else if (isDoc) {
        addLine(stats, "doc_comment", line);
      } else if (RUST_COMMENT_RE.test(stripped)) {
        addLine(stats, "comment", line);
      } else if (RUST_DOC_BLOCK_RE.test(stripped)) {
        addLine(stats, "doc_comment", line);
        blockCommentDepth = updateBlockCommentDepth(stripped, 0);
        if (blockCommentDepth > 0) blockCommentKind = "doc_comment";
      } else if (RUST_BLOCK_RE.test(stripped)) {
        addLine(stats, "comment", line);
        blockCommentDepth = updateBlockCommentDepth(stripped, 0);
        if (blockCommentDepth > 0) blockCommentKind = "comment";
      } else {
        addLine(stats, "source", line);
      }

      const depthBefore = braceDepth;
      const opens = (braceCode.match(/{/g) ?? []).length;
      const closes = (braceCode.match(/}/g) ?? []).length;

      if (pendingCfgTest && logical !== "") {
        if (braceCode.includes("{")) {
          testRegionEnds.push(depthBefore);
          pendingCfgTest = false;
        } else if (braceLogical.endsWith(";")) {
          pendingCfgTest = false;
        }
      }

      if (pendingTestAttr && logical !== "") {
        if (braceCode.includes("{")) {
          testRegionEnds.push(depthBefore);
          pendingTestAttr = false;
        } else if (braceLogical.endsWith(";")) {
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

function codeForBraceCount(text: string, state: BraceScanState): { code: string; state: BraceScanState } {
  let code = "";
  let blockDepth = state.blockDepth;
  let string = state.string;

  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (string !== null) {
      const end = string.kind === "raw"
        ? rawStringEnd(text, i, string.hashes)
        : quotedLiteralEnd(text, i, string.quote);
      if (end === -1) return { code, state: { blockDepth, string } };
      i = end;
      string = null;
      continue;
    }
    if (blockDepth > 0) {
      if (two === "/*") {
        blockDepth += 1;
        i += 1;
      } else if (two === "*/") {
        blockDepth -= 1;
        i += 1;
      }
      continue;
    }
    const rawString = rawStringStart(text, i);
    if (rawString !== null) {
      const end = rawStringEnd(text, i + rawString.prefixLength + rawString.hashes + 1, rawString.hashes);
      if (end === -1) return { code, state: { blockDepth, string: { kind: "raw", hashes: rawString.hashes } } };
      i = end;
      continue;
    }
    if (text[i] === "\"") {
      const end = quotedLiteralEnd(text, i + 1, "\"");
      if (end === -1) return { code, state: { blockDepth, string: { kind: "quoted", quote: "\"" } } };
      i = end;
      continue;
    }
    const charEnd = text[i] === "'" ? charLiteralEnd(text, i) : -1;
    if (charEnd !== -1) {
      i = charEnd;
      continue;
    }
    if (two === "//") break;
    if (two === "/*") {
      blockDepth += 1;
      i += 1;
      continue;
    }
    code += text[i];
  }
  return { code, state: { blockDepth, string } };
}

function rawStringStart(text: string, index: number): { prefixLength: number; hashes: number } | null {
  if (index > 0 && isRustIdentifierChar(text[index - 1])) return null;

  let prefixLength = 0;
  if (text[index] === "r") {
    prefixLength = 1;
  } else if ((text[index] === "b" || text[index] === "c") && text[index + 1] === "r") {
    prefixLength = 2;
  } else {
    return null;
  }

  let cursor = index + prefixLength;
  let hashes = 0;
  while (text[cursor] === "#") {
    hashes += 1;
    cursor += 1;
  }
  if (text[cursor] !== "\"") return null;
  return { prefixLength, hashes };
}

function rawStringEnd(text: string, start: number, hashes: number): number {
  const delimiter = `"${"#".repeat(hashes)}`;
  const end = text.indexOf(delimiter, start);
  return end === -1 ? -1 : end + delimiter.length - 1;
}

function quotedLiteralEnd(text: string, start: number, quote: "\"" | "'"): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return -1;
}

function charLiteralEnd(text: string, start: number): number {
  const end = quotedLiteralEnd(text, start + 1, "'");
  return end > start + 1 ? end : -1;
}

function isRustIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function updateBlockCommentDepth(text: string, blockDepth: number): number {
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "/*") {
      blockDepth += 1;
      i += 1;
    } else if (two === "*/" && blockDepth > 0) {
      blockDepth -= 1;
      i += 1;
    }
  }
  return blockDepth;
}
