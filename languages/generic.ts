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
  [".bnf", languageInfo("grammar", "Grammar")],
  [".ebnf", languageInfo("grammar", "Grammar")],
  [".html", languageInfo("html", "HTML")],
  [".il", languageInfo("intermediate-language", "Intermediate Language")],
  [".java", languageInfo("java", "Java")],
  [".lean", languageInfo("lean", "Lean")],
  [".js", languageInfo("javascript", "JavaScript")],
  [".jsx", languageInfo("javascript", "JavaScript")],
  [".mjs", languageInfo("javascript", "JavaScript")],
  [".ts", languageInfo("typescript", "TypeScript")],
  [".tsx", languageInfo("typescript", "TypeScript")],
  [".mts", languageInfo("typescript", "TypeScript")],
  [".d.ts", languageInfo("typescript", "TypeScript")],
  [".lua", languageInfo("lua", "Lua")],
  [".mlang", languageInfo("mlang", "MLang")],
  [".ncg", languageInfo("ncg", "Neknaj Circuit Game")],
  [".ncg.test.ts_", languageInfo("typescript", "TypeScript")],
  [".nlp", languageInfo("nlp", "NLP")],
  [".nvgl", languageInfo("nvgl", "NVGL")],
  [".peg", languageInfo("grammar", "Grammar")],
  [".pegjs", languageInfo("grammar", "Grammar")],
  [".php", languageInfo("php", "PHP")],
  [".ps", languageInfo("postscript", "PostScript")],
  [".ps1", languageInfo("powershell", "PowerShell")],
  [".py", languageInfo("python", "Python")],
  [".razor", languageInfo("razor", "Razor")],
  [".rnc", languageInfo("relax-ng", "RELAX NG Compact")],
  [".rb", languageInfo("ruby", "Ruby")],
  [".sh", languageInfo("shell", "Shell")],
  [".slint", languageInfo("slint", "Slint")],
  [".sql", languageInfo("sql", "SQL")],
  [".test.ts_", languageInfo("typescript", "TypeScript")],
  [".vbs", languageInfo("vbscript", "VBScript")],
  [".wat", languageInfo("webassembly-text", "WebAssembly Text")],
  [".wast", languageInfo("webassembly-text", "WebAssembly Text")],
]);

const DATA_LANGUAGES = new Map<string, LanguageInfo>([
  [".asset", languageInfo("asset", "Asset")],
  [".appxmanifest", languageInfo("manifest", "Manifest")],
  [".config", languageInfo("config", "Config")],
  [".csv", languageInfo("csv", "CSV")],
  [".csproj", languageInfo("project-file", "Project File")],
  [".gitattributes", languageInfo("git-config", "Git Config")],
  [".gitignore", languageInfo("git-config", "Git Config")],
  [".gif", languageInfo("image", "Image")],
  [".ipynb", languageInfo("notebook", "Notebook")],
  [".jsonl", languageInfo("jsonl", "JSON Lines")],
  [".jpg", languageInfo("image", "Image")],
  [".jpeg", languageInfo("image", "Image")],
  [".json", languageInfo("json", "JSON")],
  [".jsonc", languageInfo("json", "JSON")],
  [".lock", languageInfo("lockfile", "Lockfile")],
  [".log", languageInfo("log", "Log")],
  [".meta", languageInfo("metadata", "Metadata")],
  [".ncto", languageInfo("ncto-model", "NCTO Model")],
  [".ntq", languageInfo("typing-question", "Typing Question")],
  [".ntkd", languageInfo("keyboard-data", "Keyboard Data")],
  [".obj", languageInfo("wavefront-obj", "Wavefront OBJ")],
  [".plist", languageInfo("property-list", "Property List")],
  [".png", languageInfo("image", "Image")],
  [".prefab", languageInfo("prefab", "Prefab")],
  [".resx", languageInfo("resource", "Resource")],
  [".sln", languageInfo("solution-file", "Solution File")],
  [".stl", languageInfo("stl", "STL")],
  [".tsv", languageInfo("tsv", "TSV")],
  [".toml", languageInfo("toml", "TOML")],
  [".ttf", languageInfo("font", "Font")],
  [".wasm", languageInfo("webassembly-binary", "WebAssembly Binary")],
  [".unity", languageInfo("unity-scene", "Unity Scene")],
  [".xml", languageInfo("xml", "XML")],
  [".svg", languageInfo("svg", "SVG")],
  [".xaml", languageInfo("xaml", "XAML")],
  [".ymmp", languageInfo("ymmp", "YMM Project")],
  [".yaml", languageInfo("yaml", "YAML")],
  [".yml", languageInfo("yaml", "YAML")],
]);

const DOCUMENT_LANGUAGES = new Map<string, LanguageInfo>([
  [".txt", languageInfo("text", "Text")],
  [".nml", languageInfo("nml", "NML")],
  [".tex", languageInfo("tex", "TeX")],
  [".typ", languageInfo("typst", "Typst")],
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

export function isGenericData(context: ClassifierContext): boolean {
  return DATA_LANGUAGES.has(context.suffix) || DATA_LANGUAGES.has(context.lastExtension);
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
    const dataFile = isGenericData(context);

    for (const line of lines) {
      if (line.text.trim() === "") {
        addLine(stats, "other", line);
      } else if (dataFile) {
        addLine(stats, "data", line);
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
