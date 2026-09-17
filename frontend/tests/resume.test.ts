import { describe, expect, it } from "vitest";
import { abortError } from "../src/review/abort";
import {
  checkpointMatches,
  createResumePrompt,
  isReviewInterruptedError,
  joinResumedOutput,
  ReviewInterruptedError,
} from "../src/review/resume";

describe("joinResumedOutput", () => {
  it("returns the continuation when there is no prefix", () => {
    expect(joinResumedOutput("", ' {"translation": 1} ')).toBe('{"translation": 1}');
  });

  it("keeps the prefix when continuation is empty", () => {
    expect(joinResumedOutput('{"translation": 80', "")).toBe('{"translation": 80');
  });

  it("uses the continuation when it already includes the prefix", () => {
    expect(joinResumedOutput('{"translation":', '{"translation": 80}')).toBe('{"translation": 80}');
  });

  it("keeps the prefix when continuation is already a suffix", () => {
    expect(joinResumedOutput('{"translation": 80}', '80}')).toBe('{"translation": 80}');
  });

  it("strips markdown fences and overlaps fragments", () => {
    expect(joinResumedOutput('{"a":', "```json\n 1}\n```")).toBe('{"a":1}');
    expect(joinResumedOutput("abc", "```\nxyz```")).toBe("abcxyz");
    expect(joinResumedOutput("hello", "```json\nstill open")).toBe(
      "hello```json\nstill open",
    );
    expect(joinResumedOutput('{"translation": 80, "sum', 'summary": "ok"}')).toBe(
      '{"translation": 80, "summary": "ok"}',
    );
  });

  it("prefers a complete JSON continuation that does not share the prefix", () => {
    expect(
      joinResumedOutput('{"translation": 80, "sum', '{"translation": 1, "summary": "ok"}'),
    ).toBe('{"translation": 1, "summary": "ok"}');
    expect(joinResumedOutput("hello", '{"not json')).toBe('hello{"not json');
    expect(joinResumedOutput("{", "{")).toBe("{");
  });
});

describe("review resume helpers", () => {
  it("builds a continuation prompt from the stored prefix", () => {
    const prompt = createResumePrompt('{"translation": 80');
    expect(prompt).toContain("PREFIX:");
    expect(prompt).toContain('{"translation": 80');
  });

  it("detects interrupted reviews and ignores other aborts", () => {
    const interrupted = new ReviewInterruptedError('{"translation":');
    expect(interrupted.elapsedMs).toBe(0);
    expect(isReviewInterruptedError(interrupted)).toBe(true);
    expect(isReviewInterruptedError(abortError())).toBe(false);
    expect(isReviewInterruptedError(new Error("nope"))).toBe(false);
    const empty = new ReviewInterruptedError("");
    expect(isReviewInterruptedError(empty)).toBe(false);
  });

  it("matches a checkpoint only for the same code and language", () => {
    const checkpoint = {
      code: "pass",
      language: "polite" as const,
      streamedText: '{"translation":',
      elapsedMs: 10,
    };
    expect(checkpointMatches(checkpoint, { code: "pass", language: "polite" })).toBe(
      true,
    );
    expect(
      checkpointMatches(checkpoint, { code: "print(1)", language: "polite" }),
    ).toBe(false);
    expect(
      checkpointMatches(checkpoint, { code: "pass", language: "casual" }),
    ).toBe(false);
    expect(
      checkpointMatches(null, { code: "pass", language: "polite" }),
    ).toBe(false);
    expect(
      checkpointMatches(
        { ...checkpoint, streamedText: "" },
        { code: "pass", language: "polite" },
      ),
    ).toBe(false);
  });
});
