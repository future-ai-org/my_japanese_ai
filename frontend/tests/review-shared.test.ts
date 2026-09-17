import { describe, expect, it } from "vitest";
import {
  REVIEW_DETAILED_MIN_TOKENS,
  REVIEW_SYSTEM_PROMPT,
  WEBLLM_REVIEW_SCHEMA,
  coerceNumber,
  createReviewPrompt,
  normalizeReviewResult,
  splitLessonParagraphs,
  stripTeachingMarkup,
} from "../src/shared/review";
import type { ReviewInferenceTrace } from "../src/types/review";

const inference: ReviewInferenceTrace = {
  provider: "browser",
  modelId: "test-model",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  systemPrompt: "system",
  userPrompt: "user",
  responseSchema: {},
  generationConfig: { temperature: 0.2, maxTokens: 256 },
  finishReason: "stop",
  rawOutput: "{}",
  logs: [],
};

describe("review prompt contract", () => {
  it("asks for the shared English JSON schema", () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain("Return only JSON");
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "translation must be the full Japanese rendering",
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain("never a copy of the source");
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "Put that Japanese text in translation first",
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain("Do not score");
    expect(REVIEW_SYSTEM_PROMPT).toContain("exactly three short paragraphs");
    expect(REVIEW_SYSTEM_PROMPT).toContain("separated by the marker |||");
    expect(REVIEW_SYSTEM_PROMPT).toContain("important words");
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "Lesson language is English; Japanese appears only as quoted words",
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      'Example: translation "来週の打ち合わせを確認いたします。"',
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "Never write full Japanese sentences as the lesson body",
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain("No labels like register:");
    expect(Object.keys(WEBLLM_REVIEW_SCHEMA.properties)).toEqual([
      "translation",
      "lesson",
    ]);
    expect(WEBLLM_REVIEW_SCHEMA.required).toEqual(["translation", "lesson"]);
  });

  it("keeps the short token budget on a compact lesson", () => {
    const prompt = createReviewPrompt("polite", "Please reply soon.", 256);
    expect(prompt).toContain(
      "Translate this English text into polite-register Japanese",
    );
    expect(prompt).toContain("keys in this order: translation, lesson");
    expect(prompt).toContain("do not copy the English source into translation");
    expect(prompt).toContain("exactly three short English paragraphs");
    expect(prompt).toContain("separated by the marker |||");
    expect(prompt).toContain("key words with Japanese forms");
    expect(prompt).toContain("No blank lines inside lesson");
    expect(prompt).toContain(
      "Write the lesson in English for learners; Japanese only as quoted words",
    );
    expect(prompt).toContain(
      "No Japanese lesson sentences, labels, markdown, HTML, or scores",
    );
    expect(prompt).not.toContain("exactly three English teaching paragraphs");
    expect(prompt.endsWith("\n\nPlease reply soon.")).toBe(true);
  });

  it("asks for a detailed lesson once the budget reaches medium", () => {
    const prompt = createReviewPrompt(
      "polite",
      "Please reply soon.",
      REVIEW_DETAILED_MIN_TOKENS,
    );
    expect(prompt).toContain(
      "Translate this English text into polite-register Japanese",
    );
    expect(prompt).toContain("do not copy the English source into translation");
    expect(prompt).toContain("exactly three English teaching paragraphs");
    expect(prompt).toContain("separated by the marker |||");
    expect(prompt).toContain("important words with Japanese forms");
    expect(prompt).toContain("No blank lines inside lesson");
    expect(prompt).toContain(
      "Write the lesson in English for learners; Japanese only as quoted words",
    );
    expect(prompt).toContain("keys in this order: translation, lesson");
    expect(prompt).not.toContain("exactly three short English paragraphs");
  });
});

describe("normalizeReviewResult", () => {
  it("normalizes translation and lesson", () => {
    const result = normalizeReviewResult(
      {
        translation: "よろしくお願いします。",
        lesson: "Use a polite closing.",
      },
      {
        durationMs: 12,
        inference,
      },
    );

    expect(result.translation).toBe("よろしくお願いします。");
    expect(result.lesson).toBe("Use a polite closing.");
  });

  it("accepts legacy summary/rationale fields", () => {
    const result = normalizeReviewResult(
      {
        summary: "古い要約",
        rationale: "Legacy teaching notes.",
      },
      {
        durationMs: 1,
        inference,
      },
    );
    expect(result.translation).toBe("古い要約");
    expect(result.lesson).toBe("Legacy teaching notes.");
  });

  it("rejects incomplete model output", () => {
    expect(() =>
      normalizeReviewResult(
        {},
        {
          durationMs: 1,
          inference,
        },
      ),
    ).toThrow("incomplete review");
  });

  it("rejects a non-object payload", () => {
    expect(() =>
      normalizeReviewResult("not json", {
        durationMs: 1,
        inference,
      }),
    ).toThrow("invalid review");
  });

  it("strips leaked markup from teaching text", () => {
    expect(stripTeachingMarkup("<p>Hello<br/>world</p>")).toBe("Hello world");
    expect(stripTeachingMarkup("**bold** and *italic*")).toBe("bold and italic");
    expect(
      stripTeachingMarkup(
        "* **Appointment Confirmation:** Be polite.<br>" +
          "* Formal register: Use honorifics.\n*\n" +
          "**Vocabulary:** Prefer <i>keigo</i>.</p><ul><li>",
      ),
    ).toBe(
      "Appointment Confirmation: Be polite. Formal register: Use honorifics.\n\nVocabulary: Prefer keigo.",
    );
    expect(
      stripTeachingMarkup(
        "register: business tone. sentence structure: subject then verb. key vocabulary words: お知らせ (oshirase), <span style=",
      ),
    ).toBe("business tone. subject then verb. お知らせ (oshirase),");
    expect(
      stripTeachingMarkup(
        "First paragraph about register.\n\nSecond paragraph about keywords.\n\nThird paragraph about particles.",
      ),
    ).toBe(
      "First paragraph about register.\n\nSecond paragraph about keywords.\n\nThird paragraph about particles.",
    );
    expect(
      splitLessonParagraphs(
        "First paragraph about register.\n\nSecond paragraph about keywords.\n\nThird paragraph about particles.",
      ),
    ).toEqual([
      "First paragraph about register.",
      "Second paragraph about keywords.",
      "Third paragraph about particles.",
    ]);
    expect(
      stripTeachingMarkup(
        "First about register. ||| Second about keywords.|||Third about particles.",
      ),
    ).toBe(
      "First about register.|||Second about keywords.|||Third about particles.",
    );
    expect(
      splitLessonParagraphs(
        "First about register.|||Second about keywords.|||Third about particles.",
      ),
    ).toEqual([
      "First about register.",
      "Second about keywords.",
      "Third about particles.",
    ]);
    expect(coerceNumber("line 12")).toBe(12);
    expect(coerceNumber(true)).toBeUndefined();

    const result = normalizeReviewResult(
      {
        translation: "<b>こんにちは。</b>",
        lesson:
          "**Use** a polite greeting.|||Cover the key word こんにちは (konnichiwa).",
      },
      {
        durationMs: 1,
        inference,
      },
    );
    expect(result.translation).toBe("こんにちは。");
    expect(result.lesson).toBe(
      "Use a polite greeting.|||Cover the key word こんにちは (konnichiwa).",
    );
  });
});
