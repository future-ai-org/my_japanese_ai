import { describe, expect, it, vi } from "vitest";
import { editorLanguage } from "../src/editor/languageSupport";

vi.mock("@codemirror/lang-cpp", () => ({
  cpp: () => "cpp",
}));

vi.mock("@codemirror/lang-go", () => ({
  go: () => "go",
}));

vi.mock("@codemirror/lang-javascript", () => ({
  javascript: (options?: { typescript?: boolean }) =>
    options?.typescript ? "typescript" : "javascript",
}));

vi.mock("@codemirror/lang-python", () => ({
  python: () => "python",
}));

vi.mock("@codemirror/lang-rust", () => ({
  rust: () => "rust",
}));

describe("editorLanguage", () => {
  it("maps each supported language to its CodeMirror package", () => {
    expect(editorLanguage("python")).toBe("python");
    expect(editorLanguage("javascript")).toBe("javascript");
    expect(editorLanguage("typescript")).toBe("typescript");
    expect(editorLanguage("go")).toBe("go");
    expect(editorLanguage("rust")).toBe("rust");
    expect(editorLanguage("cpp")).toBe("cpp");
  });
});
