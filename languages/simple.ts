import {
  addLine,
  emptyFileStats,
  isTestPath,
  languageInfo,
  stripLineEnding,
  type ClassifierContext,
  type LanguageClassifier,
  type LanguageInfo,
  type LineKind,
  type TextLine,
} from "./types.ts";

export type LanguageDefinition = {
  id: string;
  name: string;
  suffixes?: readonly string[];
  extensions?: readonly string[];
};

type KindClassifierOptions = {
  id: string;
  name: string;
  definitions: readonly LanguageDefinition[];
  kind: Extract<LineKind, "source" | "document" | "data">;
  sourceTests?: boolean;
};

type CommentPattern = string | RegExp;

export type CommentSyntax = {
  line?: readonly CommentPattern[];
  docLine?: readonly CommentPattern[];
  block?: { start: string; end: string };
  docBlock?: { start: string; end: string };
};

export function createKindClassifier(options: KindClassifierOptions): LanguageClassifier {
  return {
    id: options.id,
    name: options.name,

    matches(_relPath: string, context: ClassifierContext): boolean {
      return matchingDefinition(options.definitions, context) !== undefined;
    },

    languageFor(_relPath: string, context: ClassifierContext): LanguageInfo {
      return languageForDefinitions(options.definitions, context);
    },

    classify(relPath: string, lines: readonly TextLine[]) {
      const stats = emptyFileStats();
      const lineKind = options.kind === "source" && options.sourceTests && isTestPath(relPath) ? "test" : options.kind;

      for (const line of lines) {
        addLine(stats, lineKind, line);
      }

      return stats;
    },
  };
}

export function createCommentClassifier(
  id: string,
  name: string,
  definitions: readonly LanguageDefinition[],
  syntax: CommentSyntax,
): LanguageClassifier {
  return {
    id,
    name,

    matches(_relPath: string, context: ClassifierContext): boolean {
      return matchingDefinition(definitions, context) !== undefined;
    },

    languageFor(_relPath: string, context: ClassifierContext): LanguageInfo {
      return languageForDefinitions(definitions, context);
    },

    classify(relPath: string, lines: readonly TextLine[]) {
      return classifyCommentedSource(relPath, lines, syntax);
    },
  };
}

export function classifyCommentedSource(relPath: string, lines: readonly TextLine[], syntax: CommentSyntax) {
  const stats = emptyFileStats();
  const testFile = isTestPath(relPath);
  let blockKind: Extract<LineKind, "comment" | "doc_comment"> | null = null;
  let blockEnd = "";

  for (const line of lines) {
    const stripped = stripLineEnding(line.text);
    const logical = stripped.trim();
    const trimmed = stripped.trimStart();

    if (logical === "") {
      addLine(stats, "other", line);
      continue;
    }

    if (testFile) {
      addLine(stats, "test", line);
      continue;
    }

    if (blockKind !== null) {
      addLine(stats, blockKind, line);
      if (stripped.includes(blockEnd)) {
        blockKind = null;
        blockEnd = "";
      }
      continue;
    }

    if (matchesAny(syntax.docLine, trimmed)) {
      addLine(stats, "doc_comment", line);
      continue;
    }

    if (matchesAny(syntax.line, trimmed)) {
      addLine(stats, "comment", line);
      continue;
    }

    if (syntax.docBlock && trimmed.startsWith(syntax.docBlock.start)) {
      addLine(stats, "doc_comment", line);
      if (!blockClosedOnSameLine(trimmed, syntax.docBlock.start, syntax.docBlock.end, docBlockCloseOffset(syntax.docBlock.start, syntax.docBlock.end))) {
        blockKind = "doc_comment";
        blockEnd = syntax.docBlock.end;
      }
      continue;
    }

    if (syntax.block && trimmed.startsWith(syntax.block.start)) {
      addLine(stats, "comment", line);
      if (!blockClosedOnSameLine(trimmed, syntax.block.start, syntax.block.end)) {
        blockKind = "comment";
        blockEnd = syntax.block.end;
      }
      continue;
    }

    addLine(stats, "source", line);
  }

  return stats;
}

export function languageForDefinitions(definitions: readonly LanguageDefinition[], context: ClassifierContext): LanguageInfo {
  const definition = matchingDefinition(definitions, context);
  if (definition === undefined) return languageInfo("unknown", "Unknown", false);
  return languageInfo(definition.id, definition.name);
}

export function matchingDefinition(
  definitions: readonly LanguageDefinition[],
  context: ClassifierContext,
): LanguageDefinition | undefined {
  return (
    definitions.find((definition) => definition.suffixes?.includes(context.suffix)) ??
    definitions.find((definition) => definition.extensions?.includes(context.lastExtension))
  );
}

function matchesAny(patterns: readonly CommentPattern[] | undefined, text: string): boolean {
  return patterns?.some((pattern) => {
    if (typeof pattern === "string") return text.startsWith(pattern);
    return pattern.test(text);
  }) ?? false;
}

function blockClosedOnSameLine(text: string, start: string, end: string, closeOffset = start.length): boolean {
  const index = text.indexOf(start);
  if (index < 0) return false;
  return text.indexOf(end, index + closeOffset) >= 0;
}

function docBlockCloseOffset(start: string, end: string): number {
  return start === "/**" && end === "*/" ? 2 : start.length;
}
