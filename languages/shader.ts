import { createCommentClassifier, type LanguageDefinition } from "./simple.ts";

const SHADER_DEFINITIONS: readonly LanguageDefinition[] = [
  { id: "glsl-fragment-shader", name: "GLSL Fragment Shader", extensions: [".frag"] },
  { id: "glsl-vertex-shader", name: "GLSL Vertex Shader", extensions: [".vert"] },
  { id: "glsl", name: "GLSL", extensions: [".glsl"] },
];

export const shaderClassifier = createCommentClassifier("shader", "Shader", SHADER_DEFINITIONS, {
  line: ["//"],
  block: { start: "/*", end: "*/" },
});
