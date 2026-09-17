import type { Language } from "../types/review";

/** Short register tag shown in the language picker. */
export const LANGUAGE_EXTENSIONS: Record<Language, string> = {
  casual: "タメ口",
  polite: "です・ます",
  formal: "敬語",
};

const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  txt: "polite",
  md: "polite",
  text: "polite",
};

/** Comma-separated accept list for `<input type="file">`. */
export const CODE_FILE_ACCEPT = ".txt,.md,.text,text/plain";

export function languageFromFilename(filename: string): Language | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}
