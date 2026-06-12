export type LineKind =
  | "blank"
  | "source"
  | "doc_comment"
  | "document"
  | "data"
  | "test"
  | "comment"
  | "other";

export const CONTENT_KINDS: readonly LineKind[] = [
  "blank",
  "source",
  "doc_comment",
  "document",
  "data",
  "test",
  "comment",
  "other",
];

export type TextLine = {
  text: string;
  rawBytes: number;
};

export type FileStats = {
  lines: number;
  chars: number;
  bytes: number;
  blank: number;
  source: number;
  doc_comment: number;
  document: number;
  data: number;
  test: number;
  comment: number;
  other: number;
  testCases: number;
  kindChars: Record<LineKind, number>;
  kindBytes: Record<LineKind, number>;
};

export type LanguageInfo = {
  id: string;
  name: string;
  known: boolean;
};

export type ClassifierContext = {
  suffix: string;
  lastExtension: string;
  pathParts: string[];
};

export type LanguageClassifier = {
  id: string;
  name: string;
  matches(relPath: string, context: ClassifierContext): boolean;
  classify(relPath: string, lines: readonly TextLine[], context: ClassifierContext): FileStats;
  languageFor?(relPath: string, context: ClassifierContext): LanguageInfo;
};

export type ResolvedLanguage = {
  classifier: LanguageClassifier;
  language: LanguageInfo;
  context: ClassifierContext;
};

export function emptyFileStats(): FileStats {
  return {
    lines: 0,
    chars: 0,
    bytes: 0,
    blank: 0,
    source: 0,
    doc_comment: 0,
    document: 0,
    data: 0,
    test: 0,
    comment: 0,
    other: 0,
    testCases: 0,
    kindChars: emptyKindRecord(),
    kindBytes: emptyKindRecord(),
  };
}

export function emptyKindRecord(): Record<LineKind, number> {
  return {
    blank: 0,
    source: 0,
    doc_comment: 0,
    document: 0,
    data: 0,
    test: 0,
    comment: 0,
    other: 0,
  };
}

export function addLine(stats: FileStats, kind: LineKind, line: TextLine): void {
  stats.lines += 1;
  stats.chars += line.text.length;
  stats.bytes += line.rawBytes;

  if (line.text.trim() === "") {
    stats.blank += 1;
    stats.kindChars.blank += line.text.length;
    stats.kindBytes.blank += line.rawBytes;
    return;
  }

  stats[kind] += 1;
  stats.kindChars[kind] += line.text.length;
  stats.kindBytes[kind] += line.rawBytes;
}

export function addTestCase(stats: FileStats): void {
  stats.testCases += 1;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function splitPath(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

export function isTestPath(path: string): boolean {
  const parts = splitPath(path);
  const basename = parts[parts.length - 1] ?? "";
  const testDirs = new Set(["test", "tests", "__tests__", "spec", "specs"]);
  return parts.some((part) => testDirs.has(part.toLowerCase())) || /(^|[._-])(test|spec)([._-]|$)/i.test(basename);
}

export function stripLineEnding(text: string): string {
  return text.replace(/[\r\n]+$/, "");
}

export function languageInfo(id: string, name: string, known = true): LanguageInfo {
  return { id, name, known };
}
