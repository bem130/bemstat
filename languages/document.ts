import { createKindClassifier, type LanguageDefinition } from "./simple.ts";

const DOCUMENT_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "text", name: "Text", extensions: [".txt"] },
  { id: "nml", name: "NML", extensions: [".nml"] },
  { id: "tex", name: "TeX", extensions: [".tex"] },
  { id: "typst", name: "Typst", extensions: [".typ"] },
  { id: "restructuredtext", name: "reStructuredText", extensions: [".rst"] },
  { id: "asciidoc", name: "AsciiDoc", extensions: [".adoc"] },
  { id: "pdf", name: "PDF", extensions: [".pdf"] },
];

export const documentClassifier = createKindClassifier({
  id: "document",
  name: "Document",
  definitions: DOCUMENT_DEFINITIONS,
  kind: "document",
});
