import { ilClassifier, postScriptClassifier, semicolonSourceClassifier } from "./assembly.ts";
import { cLikeClassifier } from "./c_like.ts";
import { customSourceClassifier } from "./custom.ts";
import { dataClassifier } from "./data.ts";
import { documentClassifier } from "./document.ts";
import { genericClassifier } from "./generic.ts";
import { grammarClassifier } from "./grammar.ts";
import { markupClassifier } from "./markup.ts";
import { namedFileClassifier } from "./named.ts";
import { neplClassifier } from "./nepl.ts";
import { neplMarkdownClassifier } from "./nepl_markdown.ts";
import { rustClassifier } from "./rust.ts";
import { scriptClassifier } from "./script.ts";
import { shaderClassifier } from "./shader.ts";
import { languageInfo, splitPath, type ClassifierContext, type LanguageClassifier, type ResolvedLanguage } from "./types.ts";

export const LANGUAGE_CLASSIFIERS: readonly LanguageClassifier[] = [
  neplClassifier,
  neplMarkdownClassifier,
  rustClassifier,
  namedFileClassifier,
  cLikeClassifier,
  shaderClassifier,
  scriptClassifier,
  customSourceClassifier,
  semicolonSourceClassifier,
  ilClassifier,
  postScriptClassifier,
  grammarClassifier,
  markupClassifier,
  dataClassifier,
  documentClassifier,
  genericClassifier,
];

export function resolveLanguage(relPath: string): ResolvedLanguage {
  const context = classifierContext(relPath);
  const classifier = LANGUAGE_CLASSIFIERS.find((candidate) => candidate.matches(relPath, context)) ?? genericClassifier;
  const language = classifier.languageFor?.(relPath, context) ?? languageInfo(classifier.id, classifier.name);
  return { classifier, language, context };
}

export function classifierContext(relPath: string): ClassifierContext {
  return {
    suffix: suffixKey(relPath),
    lastExtension: lastExtension(relPath),
    pathParts: splitPath(relPath),
  };
}

export function suffixKey(relPath: string): string {
  const basename = splitPath(relPath).pop() ?? relPath;
  const index = basename.indexOf(".");
  return index >= 0 ? basename.slice(index).toLowerCase() : "(no_ext)";
}

export function lastExtension(relPath: string): string {
  const basename = splitPath(relPath).pop() ?? relPath;
  const index = basename.lastIndexOf(".");
  if (index <= 0 || index === basename.length - 1) return "(no_ext)";
  return basename.slice(index).toLowerCase();
}
