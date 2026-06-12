import { addLine, addTestCase, type FileStats, type LineKind, stripLineEnding, type TextLine } from "./types.ts";

type FenceMarker = "`" | "~";
type FenceState = {
  kind: "in_fence" | "in_non_doctest_fence";
  marker: FenceMarker;
  length: number;
};

export type DoctestState = "document" | "await_fence" | FenceState;

const DOCTEST_META_RE = /^\s*(stdin|argv|stdout|stderr|ret|exit_code|diag_code|diag_codes|diag_span|diag_spans)\s*:\s*(.*?)\s*$/;
const DOCTEST_RE = /^\s*neplg2:test(?:\[[^\]]+\])?\s*$/;
const DOCTEST_FENCE_INFO_RE = /^(?:neplg2|nepl)\s*$/;
const FENCE_OPEN_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

export function classifyDoctestLine(
  stats: FileStats,
  line: TextLine,
  docText: string,
  state: DoctestState,
  documentKind: Extract<LineKind, "document" | "doc_comment" | "test">,
): DoctestState {
  const stripped = stripLineEnding(docText);
  const fence = parseFenceOpen(stripped);

  if (state === "document") {
    if (DOCTEST_RE.test(stripped)) {
      addLine(stats, "test", line);
      addTestCase(stats);
      return "await_fence";
    }
    if (fence !== null) {
      addLine(stats, documentKind, line);
      return { kind: "in_non_doctest_fence", marker: fence.marker, length: fence.length };
    }
    addLine(stats, documentKind, line);
    return "document";
  }

  if (typeof state === "object" && state.kind === "in_non_doctest_fence") {
    addLine(stats, documentKind, line);
    return isFenceClose(stripped, state) ? "document" : state;
  }

  if (state === "await_fence") {
    if (DOCTEST_META_RE.test(stripped)) {
      addLine(stats, "test", line);
      return "await_fence";
    }
    if (fence !== null && DOCTEST_FENCE_INFO_RE.test(fence.info)) {
      addLine(stats, "test", line);
      return { kind: "in_fence", marker: fence.marker, length: fence.length };
    }
    if (fence !== null) {
      addLine(stats, documentKind, line);
      return { kind: "in_non_doctest_fence", marker: fence.marker, length: fence.length };
    }
    addLine(stats, documentKind, line);
    return "document";
  }

  addLine(stats, "test", line);
  return typeof state === "object" && isFenceClose(stripped, state) ? "document" : state;
}

function parseFenceOpen(text: string): { marker: FenceMarker; length: number; info: string } | null {
  const match = text.match(FENCE_OPEN_RE);
  if (match === null) return null;
  const fence = match[1];
  return {
    marker: fence[0] as FenceMarker,
    length: fence.length,
    info: (match[2] ?? "").trim(),
  };
}

function isFenceClose(text: string, state: FenceState): boolean {
  const escaped = state.marker === "`" ? "`" : "~";
  const pattern = new RegExp(`^\\s{0,3}${escaped}{${state.length},}\\s*$`);
  return pattern.test(text);
}
