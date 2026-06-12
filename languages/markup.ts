import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const MARKUP_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "html", name: "HTML", extensions: [".html"] },
  { id: "razor", name: "Razor", extensions: [".razor"] },
];

export const markupClassifier = createCommentClassifier("markup-source", "Markup Source", MARKUP_DEFINITIONS, {
  block: { start: "<!--", end: "-->" },
});
