import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const SEMICOLON_SOURCE_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "assembly", name: "Assembly", extensions: [".asm"] },
  { id: "llvm-ir", name: "LLVM IR", extensions: [".ll"] },
  { id: "webassembly-text", name: "WebAssembly Text", extensions: [".wat", ".wast"] },
  { id: "nlac", name: "NLAC", extensions: [".nlac"] },
];

export const semicolonSourceClassifier = createCommentClassifier(
  "semicolon-source",
  "Semicolon Source",
  SEMICOLON_SOURCE_DEFINITIONS,
  {
    line: [";", ";;"],
  },
);

const IL_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "intermediate-language", name: "Intermediate Language", extensions: [".il"] },
];

export const ilClassifier = createCommentClassifier("il", "Intermediate Language", IL_DEFINITIONS, {
  line: ["//"],
});

const POSTSCRIPT_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "postscript", name: "PostScript", extensions: [".ps"] },
];

export const postScriptClassifier = createCommentClassifier("postscript", "PostScript", POSTSCRIPT_DEFINITIONS, {
  line: ["%"],
});
