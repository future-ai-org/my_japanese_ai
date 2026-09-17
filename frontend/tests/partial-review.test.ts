import { describe, expect, it } from "vitest";
import {
  isRicherPartial,
  parseJsonValue,
  parsePartialReview,
  reviewResultFromPartial,
} from "../src/review/partialReview";
import type { ReviewResult } from "../src/types/review";

const options = { durationMs: 40 };

function result(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    translation: "よろしくお願いします。",
    lesson: "Use a polite closing.",
    durationMs: 40,
    partial: true,
    ...overrides,
  };
}

describe("parseJsonValue", () => {
  it("parses scalars, containers, and rejects incomplete numbers", () => {
    expect(parseJsonValue(" true")?.value).toBe(true);
    expect(parseJsonValue("false")?.value).toBe(false);
    expect(parseJsonValue("null")?.value).toBeNull();
    expect(parseJsonValue("1.25 ")?.value).toBe(1.25);
    expect(parseJsonValue("1.25e+2 ")?.value).toBe(125);
    expect(parseJsonValue("-3 ")?.value).toBe(-3);
    expect(parseJsonValue('{"n":-12.5e+2}')?.value).toEqual({ n: -1250 });
    expect(parseJsonValue('{"n":0}')?.value).toEqual({ n: 0 });
    expect(parseJsonValue('"hi\\n"')?.value).toBe("hi\n");
    expect(parseJsonValue('"\\u0041"')?.value).toBe("A");
    expect(parseJsonValue('{"a":1}')?.value).toEqual({ a: 1 });
    expect(parseJsonValue("[1, true, null]")?.value).toEqual([1, true, null]);
    expect(parseJsonValue("8")).toBeNull();
    expect(parseJsonValue("8.")).toBeNull();
    expect(parseJsonValue("8e")).toBeNull();
    expect(parseJsonValue("8e+")).toBeNull();
    expect(parseJsonValue("8e1.")).toBeNull();
    expect(parseJsonValue("01")).toBeNull();
    expect(parseJsonValue("-")).toBeNull();
    expect(parseJsonValue("-a")).toBeNull();
    expect(parseJsonValue("x")).toBeNull();
    expect(parseJsonValue("t")).toBeNull();
    expect(parseJsonValue("tru")).toBeNull();
    expect(parseJsonValue('"\\u12')).toBeNull();
    expect(parseJsonValue('"\\')).toBeNull();
  });
});

describe("parsePartialReview", () => {
  it("returns null until a complete JSON value is present", () => {
    expect(parsePartialReview("")).toBeNull();
    expect(parsePartialReview("not json")).toBeNull();
    expect(parsePartialReview("{")).toBeNull();
    expect(parsePartialReview('{"translation":')).toBeNull();
    expect(parsePartialReview('{"translation": "still')).toEqual({
      translation: "still",
    });
    expect(parsePartialReview('{"translation": "\\')).toEqual({
      translation: "",
    });
    expect(parsePartialReview('{"translation": "\\u12')).toEqual({
      translation: "\\u12",
    });
  });

  it("emits complete scalar fields and open strings", () => {
    expect(parsePartialReview('{"translation": "こんにちは。"}')).toEqual({
      translation: "こんにちは。",
    });
    expect(
      parsePartialReview(
        '{"translation": "line\\nbreak", "lesson": "Why"}',
      ),
    ).toEqual({
      translation: "line\nbreak",
      lesson: "Why",
    });
    expect(parsePartialReview('{"lesson": "open')).toEqual({
      lesson: "open",
    });
    expect(parsePartialReview('{"summary": "legacy", "rationale": "old"}')).toEqual({
      translation: "legacy",
      lesson: "old",
    });
    expect(parsePartialReview('{"ignored": true, "translation": "ok"}')).toEqual({
      translation: "ok",
    });
    expect(parsePartialReview('{"translation": 4}')).toBeNull();
  });

  it("ignores legacy findings arrays while streaming translation and lesson", () => {
    expect(
      parsePartialReview(
        '{"translation": "こんにちは。", "lesson": "Greeting", "findings": [{"severity": "warning", "title": "Issue", "description": "Desc", "line": 3},',
      ),
    ).toEqual({
      translation: "こんにちは。",
      lesson: "Greeting",
    });

    expect(parsePartialReview('{"translation": "x", "findings": []}')).toEqual({
      translation: "x",
    });

    expect(parsePartialReview('{"findings":')).toBeNull();
  });
});

describe("reviewResultFromPartial", () => {
  it("builds a partial result once translation or lesson is available", () => {
    expect(
      reviewResultFromPartial({ translation: "こんにちは。" }, options),
    ).toMatchObject({
      translation: "こんにちは。",
      lesson: "",
      partial: true,
    });
    expect(reviewResultFromPartial({}, options)).toBeUndefined();
  });
});

describe("isRicherPartial", () => {
  it("detects richer partial payloads", () => {
    const previous = result({ lesson: "" });
    const next = result({ lesson: "Now with teaching notes." });
    expect(isRicherPartial(next, previous)).toBe(true);
    expect(isRicherPartial(previous, previous)).toBe(false);
    expect(isRicherPartial(previous)).toBe(true);
  });
});
