import { classifyDoctestLine, type DoctestState } from "./doctest.ts";
import {
  emptyFileStats,
  languageInfo,
  type ClassifierContext,
  type LanguageClassifier,
  type TextLine,
} from "./types.ts";

export const neplMarkdownClassifier: LanguageClassifier = {
  id: "nepl-markdown",
  name: "Markdown / NEPL doctest",

  matches(_relPath: string, context: ClassifierContext): boolean {
    return context.suffix === ".n.md" || context.lastExtension === ".md";
  },

  languageFor(_relPath: string, context: ClassifierContext) {
    if (context.suffix === ".n.md") {
      return languageInfo("nepl-markdown", "NEPL Markdown");
    }
    return languageInfo("markdown", "Markdown");
  },

  classify(_relPath: string, lines: readonly TextLine[]) {
    const stats = emptyFileStats();
    let state: DoctestState = "document";

    for (const line of lines) {
      state = classifyDoctestLine(stats, line, line.text, state, "document");
    }

    return stats;
  },
};
