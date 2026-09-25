import { describe, expect, it } from "vitest";
import {
  isRicherPartial,
  parsePartialReview,
  reviewResultFromPartial,
} from "../src/review/partialReview";
import type { ReviewResult } from "../src/types/review";

const options = { lineCount: 12, durationMs: 40, maxFindings: 3 };

function result(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    score: 80,
    summary: "Solid",
    metrics: [],
    findings: [],
    durationMs: 40,
    partial: true,
    ...overrides,
  };
}

describe("parsePartialReview", () => {
  it("returns null until a complete JSON value is present", () => {
    expect(parsePartialReview("")).toBeNull();
    expect(parsePartialReview("not json")).toBeNull();
    expect(parsePartialReview("{")).toBeNull();
    expect(parsePartialReview('{"score":')).toBeNull();
    expect(parsePartialReview('{"score": 8')).toBeNull();
    expect(parsePartialReview('{"score": -')).toBeNull();
    expect(parsePartialReview('{"score": -a,')).toBeNull();
    expect(parsePartialReview('{"score": 01,')).toBeNull();
    expect(parsePartialReview('{"score": 8.')).toBeNull();
    expect(parsePartialReview('{"score": 8e')).toBeNull();
    expect(parsePartialReview('{"score": 8e+')).toBeNull();
    expect(parsePartialReview('{"score": 8e1.')).toBeNull();
    expect(parsePartialReview('{"summary": "still')).toBeNull();
    expect(parsePartialReview('{"summary": "\\')).toBeNull();
    expect(parsePartialReview('{"summary": "\\u12')).toBeNull();
  });

  it("emits complete scalar fields and ignores unfinished values", () => {
    expect(parsePartialReview('{"score": 80,')).toEqual({ score: 80 });
    expect(parsePartialReview('{"score": 0, "none": null, "off": false}')).toEqual({
      score: 0,
    });
    expect(parsePartialReview('{"score": 80}')).toEqual({ score: 80 });
    expect(parsePartialReview('{"score": "80", "summary": "Solid"}')).toEqual({
      score: 80,
      summary: "Solid",
    });
    expect(parsePartialReview('{"score": 80 ')).toEqual({ score: 80 });
    expect(parsePartialReview('{"score": 8e1, "summary": "Solid"}')).toEqual({
      score: 80,
      summary: "Solid",
    });
    expect(
      parsePartialReview('{"score": 80, "summary": "line\\nbreak", "rationale": "Why"}'),
    ).toEqual({
      score: 80,
      summary: "line\nbreak",
      rationale: "Why",
    });
    expect(parsePartialReview('{"score": 80, "summary": "still')).toEqual({
      score: 80,
    });
    expect(parsePartialReview('{"score": -2, "summary": 4}')).toEqual({
      score: -2,
    });
    expect(parsePartialReview('{"score": 8.2, "summary": "\\u0041"}')).toEqual({
      score: 8.2,
      summary: "A",
    });
  });

  it("keeps finished array items while the rest of the document is still streaming", () => {
    const parsed = parsePartialReview(
      '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "ok"}, {"label":',
    );
    expect(parsed?.metrics).toEqual([
      { label: "Correctness", score: 90, description: "ok" },
    ]);

    const truncated = parsePartialReview(
      '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "ok"}, {"label": "Security", "score": 70, "description": "HTTPS is used',
    );
    expect(truncated?.metrics).toEqual([
      { label: "Correctness", score: 90, description: "ok" },
      { label: "Security", score: 70, description: "HTTPS is used" },
    ]);

    const withFinding = parsePartialReview(
      '{"score": 80, "findings": [{"severity": "warning", "title": "Issue", "description": "Desc", "line": 3, "suggestion": "Fix"},',
    );
    expect(withFinding?.findings).toHaveLength(1);

    const escaped = parsePartialReview(
      '{"score": 80, "metrics": [{"label": "Security", "score": 70, "description": "line\\nbreak',
    );
    expect(escaped?.metrics).toEqual([
      { label: "Security", score: 70, description: "line\nbreak" },
    ]);
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Security", "description": "still\\',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Security", description: "still" }],
    });
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Security", "description": "\\uZZZZ',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Security", description: "\\uZZZZ" }],
    });
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Security", "description": "\\uZZZZ", "score": 70}',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Security", description: "\\uZZZZ" }],
    });
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Ok", "score": 1}, {"\\uZZZZ": 1',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Ok", score: 1 }],
    });
  });

  it("reads a metric map while the object is still streaming", () => {
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": {"Correctness": {"score": 85, "description": "ok"}, "Security": {"score": 70, "description": "risk"}}}',
      ),
    ).toEqual({
      score: 80,
      metrics: [
        { label: "Correctness", score: 85, description: "ok" },
        { label: "Security", score: 70, description: "risk" },
      ],
    });
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": {"Correctness": {"score": 85, "description": "ok"}, "Security":',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Correctness", score: 85, description: "ok" }],
    });
    expect(parsePartialReview('{"score": 80, "metrics": {')).toEqual({
      score: 80,
    });
  });

  it("skips unknown complete values and closed empty arrays", () => {
    expect(
      parsePartialReview(
        '{"extra": [1, false, null, {"a": "x"}], "flag": true, "score": 12}',
      ),
    ).toEqual({ score: 12 });
    expect(parsePartialReview('{"score": 12, "metrics": 1}')).toEqual({
      score: 12,
    });
    expect(parsePartialReview('{"metrics": [], "score": 12}')).toEqual({
      metrics: [],
      score: 12,
    });
  });

  it("stops when a value cannot be parsed as JSON", () => {
    expect(parsePartialReview('{"score": foo')).toBeNull();
    expect(parsePartialReview('{"score": }')).toBeNull();
    expect(parsePartialReview('{"summary": "\\uZZZZ"}')).toBeNull();
    expect(parsePartialReview('{"\\uZZZZ": 1}')).toBeNull();
    expect(parsePartialReview('{not json')).toBeNull();
    expect(parsePartialReview('{"score" 80}')).toBeNull();
  });

  it("reads metrics from a named object map, including truncated maps", () => {
    expect(
      parsePartialReview(
        '{"metrics": {"Correctness": 90, "Security": 40}, "score": 70}',
      ),
    ).toEqual({
      metrics: [
        { label: "Correctness", score: 90, description: undefined, snippet: undefined },
        { label: "Security", score: 40, description: undefined, snippet: undefined },
      ],
      score: 70,
    });
    expect(
      parsePartialReview('{"metrics": {"Correctness": 90, "Security": 40'),
    ).toEqual({
      metrics: [
        { label: "Correctness", score: 90, description: undefined, snippet: undefined },
      ],
    });
    expect(parsePartialReview('{"metrics": {')).toBeNull();
    expect(parsePartialReview('{"metrics": {}, "score": 12}')).toEqual({
      metrics: [],
      score: 12,
    });
  });

  it("keeps finished nested fields when an object item is not valid JSON", () => {
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{,"label": "Correctness", "score": 90}]}',
      )?.metrics,
    ).toEqual([
      { label: "Correctness", score: 90, description: undefined, snippet: undefined },
    ]);
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "\\uZZZZ"}]}',
      ),
    ).toEqual({
      score: 80,
      metrics: [
        {
          label: "Correctness",
          score: 90,
          description: "\\uZZZZ",
        },
      ],
    });
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "ok\\n',
      )?.metrics,
    ).toEqual([
      {
        label: "Correctness",
        score: 90,
        description: "ok\n",
        snippet: undefined,
      },
    ]);
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "\\uZZZZ',
      )?.metrics,
    ).toEqual([
      {
        label: "Correctness",
        score: 90,
        description: "\\uZZZZ",
        snippet: undefined,
      },
    ]);
    expect(
      parsePartialReview(
        '{"score": 80, "metrics": [{"label": "Correctness", "score": 90, "description": "\\',
      ),
    ).toEqual({
      score: 80,
      metrics: [{ label: "Correctness", score: 90, description: "" }],
    });
  });

  it("stops walking a nested object when the next token is not a field", () => {
    expect(parsePartialReview('{"score": 80, "metrics": ["still')).toEqual({
      score: 80,
      metrics: [],
    });
    expect(parsePartialReview('{"score": 80, "metrics": [   ')).toEqual({
      score: 80,
      metrics: [],
    });
    expect(parsePartialReview('{"score": 80, "metrics": [{]}')).toEqual({
      score: 80,
      metrics: [],
    });
    expect(parsePartialReview('{"score": 80, "metrics": [{"\\uZZZZ": 1}]}')).toEqual({
      score: 80,
      metrics: [],
    });
    expect(
      parsePartialReview('{"score": 80, "metrics": [{"label" "Correctness"}]}'),
    ).toEqual({
      score: 80,
      metrics: [],
    });
  });
});

describe("reviewResultFromPartial", () => {
  it("builds a live review from complete parts and skips invalid items", () => {
    const built = reviewResultFromPartial(
      {
        score: 120,
        summary: "Solid",
        rationale: "Because",
        metrics: [
          { label: "Correctness", score: -4, description: "Weak" },
          { score: 1 },
        ],
        findings: [
          {
            severity: "critical",
            title: "Crash",
            description: "Null",
            line: 40,
            suggestion: "Guard",
          },
          { severity: "nope", title: "Bad", description: "No", line: 1 },
          {
            severity: "warning",
            title: "Second",
            description: "Desc",
            line: 2,
          },
        ],
      },
      options,
    );

    expect(built).toMatchObject({
      score: 100,
      summary: "Solid",
      rationale: "Because",
      partial: true,
      metrics: [{ label: "Correctness", score: 0, description: "Weak" }],
    });
    expect(built?.findings).toHaveLength(2);
    expect(built?.findings[0]).toMatchObject({
      id: "review-0-live",
      line: 12,
      suggestion: "Guard",
    });
  });

  it("waits for a score before rendering", () => {
    expect(
      reviewResultFromPartial({ summary: "Solid", metrics: [] }, options),
    ).toBeUndefined();
    expect(
      reviewResultFromPartial({ score: 10 }, options)?.summary,
    ).toBe("");
  });
});

describe("isRicherPartial", () => {
  it("treats the first result as richer and ignores identical updates", () => {
    const first = result();
    expect(isRicherPartial(first)).toBe(true);
    expect(isRicherPartial(first, first)).toBe(false);
    expect(
      isRicherPartial(result({ summary: "Better" }), first),
    ).toBe(true);
    expect(
      isRicherPartial(
        result({
          findings: [
            {
              id: "review-0-live",
              severity: "warning",
              title: "Issue",
              description: "Desc",
              line: 1,
            },
          ],
        }),
        first,
      ),
    ).toBe(true);
  });
});
