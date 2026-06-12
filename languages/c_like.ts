import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const C_LIKE_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "typescript", name: "TypeScript", suffixes: [".d.ts", ".test.ts_", ".ncg.test.ts_"], extensions: [".ts", ".tsx", ".mts"] },
  { id: "javascript", name: "JavaScript", extensions: [".js", ".jsx", ".mjs", ".cjs"] },
  { id: "c", name: "C", extensions: [".c"] },
  { id: "c-cpp-header", name: "C/C++ Header", extensions: [".h", ".hpp"] },
  { id: "cpp", name: "C++", extensions: [".cpp", ".cxx", ".cc"] },
  { id: "csharp", name: "C#", extensions: [".cs"] },
  { id: "java", name: "Java", extensions: [".java"] },
  { id: "css", name: "CSS", extensions: [".css"] },
  { id: "php", name: "PHP", extensions: [".php"] },
  { id: "slint", name: "Slint", extensions: [".slint"] },
];

export const cLikeClassifier = createCommentClassifier("c-like", "C-like Source", C_LIKE_DEFINITIONS, {
  line: ["//"],
  docLine: ["///", "//!"],
  block: { start: "/*", end: "*/" },
  docBlock: { start: "/**", end: "*/" },
});
