import { describe, expect, it } from "vitest";
import {
  CODE_FILE_ACCEPT,
  LANGUAGE_EXTENSIONS,
  languageFromFilename,
} from "../src/data/languages";
import { LANGUAGES } from "../src/types/review";

describe("languageFromFilename", () => {
  it("maps canonical and alias extensions to languages", () => {
    expect(languageFromFilename("main.py")).toBe("python");
    expect(languageFromFilename("app.js")).toBe("javascript");
    expect(languageFromFilename("app.mjs")).toBe("javascript");
    expect(languageFromFilename("app.cjs")).toBe("javascript");
    expect(languageFromFilename("App.jsx")).toBe("javascript");
    expect(languageFromFilename("index.ts")).toBe("typescript");
    expect(languageFromFilename("index.tsx")).toBe("typescript");
    expect(languageFromFilename("mod.mts")).toBe("typescript");
    expect(languageFromFilename("mod.cts")).toBe("typescript");
    expect(languageFromFilename("server.go")).toBe("go");
    expect(languageFromFilename("lib.rs")).toBe("rust");
    expect(languageFromFilename("main.cpp")).toBe("cpp");
    expect(languageFromFilename("main.cc")).toBe("cpp");
    expect(languageFromFilename("main.cxx")).toBe("cpp");
    expect(languageFromFilename("main.c")).toBe("cpp");
    expect(languageFromFilename("main.h")).toBe("cpp");
    expect(languageFromFilename("main.hpp")).toBe("cpp");
    expect(languageFromFilename("main.hh")).toBe("cpp");
  });

  it("is case-insensitive and ignores path prefixes", () => {
    expect(languageFromFilename("SRC/Util.TS")).toBe("typescript");
    expect(languageFromFilename("/tmp/nested/file.RS")).toBe("rust");
  });

  it("returns null for missing or unknown extensions", () => {
    expect(languageFromFilename("README")).toBeNull();
    expect(languageFromFilename("trailing.")).toBeNull();
    expect(languageFromFilename("notes.md")).toBeNull();
    expect(languageFromFilename(".gitignore")).toBeNull();
  });
});

describe("language file metadata", () => {
  it("exposes a canonical extension for every language", () => {
    expect(Object.keys(LANGUAGE_EXTENSIONS).sort()).toEqual(
      [...LANGUAGES].sort(),
    );
    for (const language of LANGUAGES) {
      expect(LANGUAGE_EXTENSIONS[language]).toMatch(/^\.[a-z]+$/);
      expect(
        languageFromFilename(`sample${LANGUAGE_EXTENSIONS[language]}`),
      ).toBe(language);
    }
  });

  it("builds an accept list covering every known extension", () => {
    expect(CODE_FILE_ACCEPT.split(",")).toEqual(
      expect.arrayContaining([
        ".py",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".go",
        ".rs",
        ".cpp",
        ".c",
        ".h",
      ]),
    );
    expect(CODE_FILE_ACCEPT).not.toContain(" ");
  });
});
