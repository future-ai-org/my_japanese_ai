import type { Language } from "../types/review";

/** Canonical extension shown in the language picker. */
export const LANGUAGE_EXTENSIONS: Record<Language, string> = {
  python: ".py",
  javascript: ".js",
  typescript: ".ts",
  go: ".go",
  rust: ".rs",
  cpp: ".cpp",
};

const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "cpp",
  h: "cpp",
  hpp: "cpp",
  hh: "cpp",
};

/** Comma-separated accept list for `<input type="file">`. */
export const CODE_FILE_ACCEPT = Object.keys(EXTENSION_TO_LANGUAGE)
  .map((ext) => `.${ext}`)
  .join(",");

export function languageFromFilename(filename: string): Language | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}
