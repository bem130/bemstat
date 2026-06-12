import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const CUSTOM_SOURCE_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "mlang", name: "MLang", extensions: [".mlang"] },
  { id: "ncg", name: "Neknaj Circuit Game", extensions: [".ncg"] },
  { id: "nlp", name: "NLP", extensions: [".nlp"] },
  { id: "nvgl", name: "NVGL", extensions: [".nvgl"] },
  { id: "neknaj-language", name: "Neknaj Language", extensions: [".nl"] },
  { id: "nlpc", name: "NLPC", extensions: [".nlpc"] },
  { id: "ski", name: "Ski", extensions: [".sk"] },
];

export const customSourceClassifier = createCommentClassifier("custom-source", "Custom Source", CUSTOM_SOURCE_DEFINITIONS, {
  line: ["//", "#"],
  block: { start: "/*", end: "*/" },
});
