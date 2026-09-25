import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import type { Language } from "../types/review";

export function editorLanguage(language: Language) {
  switch (language) {
    case "python":
      return python();
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "go":
      return go();
    case "rust":
      return rust();
    case "cpp":
      return cpp();
  }
}
