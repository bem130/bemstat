import {
  addLine,
  emptyFileStats,
  isTestPath,
  languageInfo,
  type ClassifierContext,
  type LanguageClassifier,
  type LanguageInfo,
  type TextLine,
} from "./types.ts";

const SOURCE_LANGUAGES = new Map<string, LanguageInfo>([
  [".c", languageInfo("c", "C")],
  [".h", languageInfo("c-cpp-header", "C/C++ Header")],
  [".cpp", languageInfo("cpp", "C++")],
  [".cxx", languageInfo("cpp", "C++")],
  [".cc", languageInfo("cpp", "C++")],
  [".hpp", languageInfo("c-cpp-header", "C/C++ Header")],
  [".cs", languageInfo("csharp", "C#")],
  [".css", languageInfo("css", "CSS")],
  [".html", languageInfo("html", "HTML")],
  [".java", languageInfo("java", "Java")],
  [".js", languageInfo("javascript", "JavaScript")],
  [".jsx", languageInfo("javascript", "JavaScript")],
  [".mjs", languageInfo("javascript", "JavaScript")],
  [".ts", languageInfo("typescript", "TypeScript")],
  [".tsx", languageInfo("typescript", "TypeScript")],
  [".mts", languageInfo("typescript", "TypeScript")],
  [".d.ts", languageInfo("typescript", "TypeScript")],
  [".py", languageInfo("python", "Python")],
  [".rb", languageInfo("ruby", "Ruby")],
  [".sh", languageInfo("shell", "Shell")],
  [".sql", languageInfo("sql", "SQL")],
  [".wat", languageInfo("webassembly-text", "WebAssembly Text")],
  [".wast", languageInfo("webassembly-text", "WebAssembly Text")],
  [".wasm", languageInfo("webassembly", "WebAssembly")],
  [".yaml", languageInfo("yaml", "YAML")],
  [".yml", languageInfo("yaml", "YAML")],
]);

const DATA_LANGUAGES = new Map<string, LanguageInfo>([
  [".json", languageInfo("json", "JSON")],
  [".jsonc", languageInfo("json", "JSON")],
  [".toml", languageInfo("toml", "TOML")],
  [".xml", languageInfo("xml", "XML")],
  [".svg", languageInfo("svg", "SVG")],
]);

const DOCUMENT_LANGUAGES = new Map<string, LanguageInfo>([
  [".txt", languageInfo("text", "Text")],
  [".rst", languageInfo("restructuredtext", "reStructuredText")],
  [".adoc", languageInfo("asciidoc", "AsciiDoc")],
]);

export function knownGenericLanguage(context: ClassifierContext): LanguageInfo {
  return (
    SOURCE_LANGUAGES.get(context.suffix) ??
    SOURCE_LANGUAGES.get(context.lastExtension) ??
    DATA_LANGUAGES.get(context.suffix) ??
    DATA_LANGUAGES.get(context.lastExtension) ??
    DOCUMENT_LANGUAGES.get(context.suffix) ??
    DOCUMENT_LANGUAGES.get(context.lastExtension) ??
    languageInfo("unknown", "Unknown", false)
  );
}

export function isGenericSource(context: ClassifierContext): boolean {
  return SOURCE_LANGUAGES.has(context.suffix) || SOURCE_LANGUAGES.has(context.lastExtension);
}

export function isGenericDocument(context: ClassifierContext): boolean {
  return DOCUMENT_LANGUAGES.has(context.suffix) || DOCUMENT_LANGUAGES.has(context.lastExtension);
}

export const genericClassifier: LanguageClassifier = {
  id: "generic",
  name: "Generic",

  matches(): boolean {
    return true;
  },

  languageFor(_relPath: string, context: ClassifierContext) {
    return knownGenericLanguage(context);
  },

  classify(relPath: string, lines: readonly TextLine[], context: ClassifierContext) {
    const stats = emptyFileStats();
    const testFile = isTestPath(relPath);
    const sourceFile = isGenericSource(context);
    const documentFile = isGenericDocument(context);

    for (const line of lines) {
      if (line.text.trim() === "") {
        addLine(stats, "other", line);
      } else if (testFile) {
        addLine(stats, "test", line);
      } else if (sourceFile) {
        addLine(stats, "source", line);
      } else if (documentFile) {
        addLine(stats, "document", line);
      } else {
        addLine(stats, "other", line);
      }
    }

    return stats;
  },
};
