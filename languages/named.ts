import { classifyCommentedSource, type CommentSyntax } from "./simple.ts";
import {
  addLine,
  emptyFileStats,
  languageInfo,
  type ClassifierContext,
  type LanguageClassifier,
  type LanguageInfo,
  type LineKind,
  type TextLine,
} from "./types.ts";

type NamedDefinition = {
  id: string;
  name: string;
  kind: Extract<LineKind, "source" | "document">;
  syntax?: CommentSyntax;
  matches(relPath: string, context: ClassifierContext): boolean;
};

const HASH_COMMENT: CommentSyntax = { line: ["#"] };
const HTML_COMMENT: CommentSyntax = { block: { start: "<!--", end: "-->" } };

const NAMED_DEFINITIONS: readonly NamedDefinition[] = [
  {
    id: "license",
    name: "License",
    kind: "document",
    matches(_relPath, context) {
      const name = basename(context);
      return name === "license" || name.endsWith("-license");
    },
  },
  {
    id: "makefile",
    name: "Makefile",
    kind: "source",
    syntax: HASH_COMMENT,
    matches(_relPath, context) {
      return basename(context) === "makefile";
    },
  },
  {
    id: "dockerfile",
    name: "Dockerfile",
    kind: "source",
    syntax: HASH_COMMENT,
    matches(_relPath, context) {
      return basename(context) === "dockerfile";
    },
  },
  {
    id: "shell",
    name: "Shell",
    kind: "source",
    syntax: HASH_COMMENT,
    matches(_relPath, context) {
      return context.lastExtension === "(no_ext)" && context.pathParts.some((part) => part === ".bin");
    },
  },
  {
    id: "html",
    name: "HTML",
    kind: "source",
    syntax: HTML_COMMENT,
    matches(_relPath, context) {
      return /^ver_\d+(?:\.\d+)+$/.test(basename(context));
    },
  },
];

export const namedFileClassifier: LanguageClassifier = {
  id: "named-file",
  name: "Named File",

  matches(relPath: string, context: ClassifierContext): boolean {
    return namedDefinition(relPath, context) !== undefined;
  },

  languageFor(relPath: string, context: ClassifierContext): LanguageInfo {
    const definition = namedDefinition(relPath, context);
    if (definition === undefined) return languageInfo("unknown", "Unknown", false);
    return languageInfo(definition.id, definition.name);
  },

  classify(relPath: string, lines: readonly TextLine[], context: ClassifierContext) {
    const definition = namedDefinition(relPath, context);
    if (definition?.kind === "source") {
      return classifyCommentedSource(relPath, lines, definition.syntax ?? {});
    }

    const stats = emptyFileStats();
    for (const line of lines) {
      addLine(stats, "document", line);
    }
    return stats;
  },
};

function namedDefinition(relPath: string, context: ClassifierContext): NamedDefinition | undefined {
  return NAMED_DEFINITIONS.find((definition) => definition.matches(relPath, context));
}

function basename(context: ClassifierContext): string {
  return context.pathParts[context.pathParts.length - 1]?.toLowerCase() ?? "";
}
