import { classifyDoctestLine, type DoctestState } from "./doctest.ts";
import {
  addLine,
  emptyFileStats,
  isTestPath,
  languageInfo,
  stripLineEnding,
  type ClassifierContext,
  type LanguageClassifier,
  type TextLine,
} from "./types.ts";

const NEPL_DOC_RE = /^\s*\/\/:(\|)?\s?(.*)$/;

export const neplClassifier: LanguageClassifier = {
  id: "nepl",
  name: "NEPL",

  matches(_relPath: string, context: ClassifierContext): boolean {
    return context.lastExtension === ".nepl";
  },

  languageFor() {
    return languageInfo("nepl", "NEPL");
  },

  classify(relPath: string, lines: readonly TextLine[]) {
    const stats = emptyFileStats();
    const testFile = isTestPath(relPath);
    let state: DoctestState = "document";

    for (const line of lines) {
      const stripped = stripLineEnding(line.text);
      const match = stripped.match(NEPL_DOC_RE);

      if (match) {
        const docText = match[2] ?? "";
        state = classifyDoctestLine(stats, line, docText, state, testFile ? "test" : "doc_comment");
        continue;
      }

      state = "document";

      if (line.text.trim() === "") {
        addLine(stats, "other", line);
      } else if (testFile) {
        addLine(stats, "test", line);
      } else if (stripped.trimStart().startsWith("//")) {
        addLine(stats, "comment", line);
      } else {
        addLine(stats, "source", line);
      }
    }

    return stats;
  },
};
