import { addLine, addTestCase, type FileStats, type LineKind, stripLineEnding, type TextLine } from "./types.ts";

export type DoctestState = "document" | "await_fence" | "in_fence";

const DOCTEST_META_RE = /^\s*(stdin|argv|stdout|stderr|ret|diag_code|diag_codes|diag_span|diag_spans)\s*:\s*(.*?)\s*$/;
const DOCTEST_RE = /^\s*neplg2:test(?:\[[^\]]+\])?\s*$/;
const DOCTEST_FENCE_OPEN_RE = /^\s*```(?:neplg2|nepl)\s*$/;
const DOCTEST_FENCE_CLOSE_RE = /^\s*```\s*$/;

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
    addLine(stats, documentKind, line);
    return "document";
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
    addLine(stats, documentKind, line);
    return "document";
  }

  addLine(stats, "test", line);
  if (DOCTEST_FENCE_CLOSE_RE.test(stripped)) {
    return "document";
  }
  return "in_fence";
}
