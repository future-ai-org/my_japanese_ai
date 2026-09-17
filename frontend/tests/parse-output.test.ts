import { describe, expect, it } from "vitest";
import { parseReviewJson, parseReviewOutput } from "../src/review/parseOutput";

const review = {
  translation: "よろしくお願いします。",
  lesson: "Use a polite closing when asking for help.",
};

describe("parseReviewJson", () => {
  it("reads fenced JSON and surrounding prose", () => {
    expect(parseReviewJson(`\`\`\`json\n${JSON.stringify(review)}\n\`\`\``)).toEqual(
      review,
    );
    expect(
      parseReviewJson(`以下が結果です。\n${JSON.stringify(review)}\n以上。`),
    ).toEqual(review);
    expect(parseReviewJson(JSON.stringify({ review }))).toEqual(review);
  });

  it("recovers a truncated review object", () => {
    expect(
      parseReviewJson(
        '{"translation": "こんにちは。", "lesson": "Greeting", "findings": [',
      ),
    ).toEqual({
      translation: "こんにちは。",
      lesson: "Greeting",
    });
    expect(parseReviewJson('{"translation": "こんにちは。",')).toEqual({
      translation: "こんにちは。",
      lesson: "",
    });
  });

  it("keeps a non-review object as a last-resort fallback", () => {
    expect(parseReviewJson('{"note": "ok"}')).toEqual({ note: "ok" });
    expect(parseReviewJson('prefix {"foo": 1}')).toEqual({ foo: 1 });
    expect(parseReviewJson('[{"skip": true}, {"foo": 1}]')).toEqual([
      { skip: true },
      { foo: 1 },
    ]);
  });

  it("finds a review nested in an array", () => {
    expect(parseReviewJson(JSON.stringify([{ skip: true }, review]))).toEqual(
      review,
    );
  });

  it("rejects text with no review object", () => {
    expect(() => parseReviewJson("{not json")).toThrow("invalid JSON");
    expect(() => parseReviewJson("definitely not a review")).toThrow(
      "invalid JSON",
    );
  });
});

describe("parseReviewOutput", () => {
  it("normalizes translation and lesson fields", () => {
    expect(
      parseReviewOutput(
        '{"translation": "よろしくお願いします。", "lesson": "Polite closing."}',
      ),
    ).toMatchObject({
      translation: "よろしくお願いします。",
      lesson: "Polite closing.",
    });
  });

  it("maps legacy summary/rationale payloads", () => {
    expect(
      parseReviewOutput(
        '{"summary": "古い翻訳", "rationale": "Legacy lesson."}',
      ),
    ).toMatchObject({
      translation: "古い翻訳",
      lesson: "Legacy lesson.",
    });
  });

  it("rejects payloads without translation or lesson", () => {
    expect(() => parseReviewOutput('{"findings": []}')).toThrow("invalid JSON");
    expect(() =>
      parseReviewJson(
        '{"findings":[{"severity":"warning","title":"T","description":"D","line":1',
      ),
    ).toThrow("invalid JSON");
  });

  it("coerces numeric translation values to text", () => {
    expect(parseReviewOutput('{"translation": 42, "lesson": "n"}')).toMatchObject({
      translation: "42",
      lesson: "n",
    });
  });
});
