import {
  addLine,
  emptyFileStats,
  isTestPath,
  languageInfo,
  stripLineEnding,
  type ClassifierContext,
  type LanguageClassifier,
  type LanguageInfo,
  type TextLine,
} from "./types.ts";

type ScriptDefinition = {
  id: string;
  name: string;
  extensions: readonly string[];
  comment: RegExp;
};

const SCRIPT_DEFINITIONS: readonly ScriptDefinition[] = [
  { id: "python", name: "Python", extensions: [".py"], comment: /^\s*#/ },
  { id: "shell", name: "Shell", extensions: [".sh"], comment: /^\s*#/ },
  { id: "powershell", name: "PowerShell", extensions: [".ps1"], comment: /^\s*#/ },
  { id: "ruby", name: "Ruby", extensions: [".rb"], comment: /^\s*#/ },
  { id: "lua", name: "Lua", extensions: [".lua"], comment: /^\s*--/ },
  { id: "lean", name: "Lean", extensions: [".lean"], comment: /^\s*--/ },
  { id: "vbscript", name: "VBScript", extensions: [".vbs"], comment: /^\s*'/ },
  { id: "batch", name: "Batch", extensions: [".bat", ".cmd"], comment: /^\s*(?:@?rem\b|::)/i },
];

export const scriptClassifier: LanguageClassifier = {
  id: "script",
  name: "Script",

  matches(_relPath: string, context: ClassifierContext): boolean {
    return scriptDefinition(context) !== undefined;
  },

  languageFor(_relPath: string, context: ClassifierContext): LanguageInfo {
    const definition = scriptDefinition(context);
    if (definition === undefined) return languageInfo("unknown", "Unknown", false);
    return languageInfo(definition.id, definition.name);
  },

  classify(relPath: string, lines: readonly TextLine[], context: ClassifierContext) {
    const stats = emptyFileStats();
    const definition = scriptDefinition(context);
    const testFile = isTestPath(relPath);

    for (const line of lines) {
      const stripped = stripLineEnding(line.text);
      if (stripped.trim() === "") {
        addLine(stats, "other", line);
      } else if (testFile) {
        addLine(stats, "test", line);
      } else if (definition?.comment.test(stripped)) {
        addLine(stats, "comment", line);
      } else {
        addLine(stats, "source", line);
      }
    }

    return stats;
  },
};

function scriptDefinition(context: ClassifierContext): ScriptDefinition | undefined {
  return SCRIPT_DEFINITIONS.find((definition) => definition.extensions.includes(context.lastExtension));
}
