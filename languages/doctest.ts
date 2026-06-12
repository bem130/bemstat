import { addLine, addTestCase, type FileStats, type LineKind, stripLineEnding, type TextLine } from "./types.ts";

export type DoctestState = "document" | "await_fence" | "in_fence" | "in_non_doctest_fence";

const DOCTEST_META_RE = /^\s*(stdin|argv|stdout|stderr|ret|exit_code|diag_code|diag_codes|diag_span|diag_spans)\s*:\s*(.*?)\s*$/;
const DOCTEST_RE = /^\s*neplg2:test(?:\[[^\]]+\])?\s*$/;
const DOCTEST_FENCE_OPEN_RE = /^\s*```(?:neplg2|nepl)\s*$/;
const DOCTEST_FENCE_CLOSE_RE = /^\s*```\s*$/;
const FENCE_OPEN_RE = /^\s*```.*$/;

export function classifyDoctestLine(
  stats: FileStats,
  line: TextLine,
  docText: string,
  state: DoctestState,
  documentKind: Extract<LineKind, "document" | "doc_comment" | "test">,
): DoctestState {
  const stripped = stripLineEnding(docText);

  if (state === "document") {
    if (DOCTEST_RE.test(stripped)) {
      addLine(stats, "test", line);
      addTestCase(stats);
      return "await_fence";
    }
    if (FENCE_OPEN_RE.test(stripped)) {
      addLine(stats, documentKind, line);
      return "in_non_doctest_fence";
    }
    addLine(stats, documentKind, line);
    return "document";
  }

  if (state === "in_non_doctest_fence") {
    addLine(stats, documentKind, line);
    return DOCTEST_FENCE_CLOSE_RE.test(stripped) ? "document" : "in_non_doctest_fence";
  }

  if (state === "await_fence") {
    if (DOCTEST_META_RE.test(stripped)) {
      addLine(stats, "test", line);
      return "await_fence";
    }
    if (DOCTEST_FENCE_OPEN_RE.test(stripped)) {
      addLine(stats, "test", line);
      return "in_fence";
    }
    if (FENCE_OPEN_RE.test(stripped)) {
      addLine(stats, documentKind, line);
      return "in_non_doctest_fence";
    }
    addLine(stats, documentKind, line);
    return "document";
  }

  addLine(stats, "test", line);
  if (DOCTEST_FENCE_CLOSE_RE.test(stripped)) {
    return "document";
  }
  return "in_fence";
}
