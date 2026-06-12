import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const GRAMMAR_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "grammar", name: "Grammar", extensions: [".bnf", ".ebnf", ".peg", ".pegjs"] },
  { id: "relax-ng", name: "RELAX NG Compact", extensions: [".rnc"] },
  { id: "scheme", name: "Scheme", extensions: [".scm"] },
];

export const grammarClassifier = createCommentClassifier("grammar-source", "Grammar Source", GRAMMAR_DEFINITIONS, {
  line: ["//", "#", ";"],
  block: { start: "/*", end: "*/" },
});
