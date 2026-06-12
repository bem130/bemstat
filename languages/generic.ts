import {
  addLine,
  emptyFileStats,
  isTestPath,
  languageInfo,
  type ClassifierContext,
  type LanguageClassifier,
  type TextLine,
} from "./types.ts";

export const genericClassifier: LanguageClassifier = {
  id: "generic",
  name: "Generic",

  matches(): boolean {
    return true;
  },

  languageFor(_relPath: string, _context: ClassifierContext) {
    return languageInfo("unknown", "Unknown", false);
  },

  classify(relPath: string, lines: readonly TextLine[]) {
    const stats = emptyFileStats();
    const testFile = isTestPath(relPath);

    for (const line of lines) {
      addLine(stats, testFile ? "test" : "other", line);
    }

    return stats;
  },
};
