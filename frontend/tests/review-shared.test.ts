import { describe, expect, it } from "vitest";
import {
  REVIEW_DETAILED_MIN_TOKENS,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
  WEBLLM_REVIEW_SCHEMA,
  collectMetrics,
  createReviewPrompt,
  normalizeReviewResult,
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
  generationConfig: { temperature: 0.2, maxTokens: 256, maxFindings: 3 },
  finishReason: "stop",
  rawOutput: "{}",
  logs: [],
};

describe("review prompt contract", () => {
  it("asks for the shared English JSON schema", () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain("Return only JSON");
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "write metrics as an object with keys Correctness, Security, and Maintainability before summary",
    );
    expect(Object.keys(REVIEW_SCHEMA.properties)).toEqual([
      "score",
      "metrics",
      "summary",
      "rationale",
      "findings",
    ]);
    expect(REVIEW_SCHEMA.properties.metrics.required).toEqual([
      "Correctness",
      "Security",
      "Maintainability",
    ]);
    expect(
      REVIEW_SCHEMA.properties.metrics.properties.Correctness.required,
    ).toEqual(["score", "description"]);
    expect(REVIEW_SCHEMA.properties.findings.items.required).toEqual([
      "severity",
      "title",
      "description",
      "line",
    ]);
    expect(
      WEBLLM_REVIEW_SCHEMA.properties.metrics.properties.Correctness.required,
    ).toEqual(["score", "description"]);
    expect(
      WEBLLM_REVIEW_SCHEMA.properties.metrics.properties.Correctness.properties,
    ).not.toHaveProperty("snippet");
  });

  it("keeps the short token budget on one-sentence metrics", () => {
    const prompt = createReviewPrompt("python", "print('ok')", 256);
    expect(prompt).toContain(
      "metrics as an object with keys Correctness, Security, and Maintainability",
    );
    expect(prompt).toContain("keys in this order: score, metrics, summary, rationale, findings");
    expect(prompt).toContain("one-sentence description");
    expect(prompt).toContain("Do not include a snippet");
    expect(prompt).toContain("Never omit a metric to make room for findings");
    expect(prompt).toContain("Do not define what Correctness, Security, or Maintainability means");
    expect(prompt).not.toContain("write 3-4 sentences in description");
    expect(prompt.endsWith("\n\nprint('ok')")).toBe(true);
  });

  it("asks for 3-4 sentence metrics once the budget reaches medium", () => {
    const prompt = createReviewPrompt("python", "print('ok')", REVIEW_DETAILED_MIN_TOKENS);
    expect(prompt).toContain("write 3-4 sentences in description");
    expect(prompt).toContain("Do not write a one-sentence description");
    expect(prompt).toContain("Close all three metric values before writing summary");
  });
});

describe("normalizeReviewResult", () => {
  it("clamps scores, lines, metrics, and findings", () => {
    const result = normalizeReviewResult(
      {
        score: 120,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          {
            label: "Correctness",
            score: -5,
            description: "Incorrect result.",
            snippet: "return wrong",
          },
          {
            label: "Security",
            score: 50,
            description: "Some risk.",
            snippet: "eval(input)",
          },
          {
            label: "Maintainability",
            score: 101,
            description: "Easy to change.",
            snippet: "def helper():",
          },
          { label: "Ignored", score: 1 },
        ],
        findings: [
          {
            severity: "warning",
            title: "Issue",
            description: "Description",
            line: 99,
            suggestion: "Fix it",
          },
          {
            severity: "suggestion",
            title: "Second",
            description: "Description",
            line: 0,
            suggestion: "",
          },
        ],
      },
      {
        lineCount: 10,
        durationMs: 12,
        maxFindings: 1,
        inference,
        createId: () => "id",
      },
    );

    expect(result.score).toBe(100);
    expect(result.metrics.map((metric) => metric.score)).toEqual([0, 50, 100]);
    expect(result.metrics[0].description).toBe("Incorrect result.");
    expect(result.metrics[0].snippet).toBe("return wrong");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: "review-0-id",
      line: 10,
    });
  });

  it("rejects incomplete model output", () => {
    expect(() =>
      normalizeReviewResult(
        { summary: "Summary" },
        {
          lineCount: 1,
          durationMs: 1,
          maxFindings: 3,
          inference,
          createId: () => "id",
        },
      ),
    ).toThrow("incomplete review");
  });

  it("rejects a non-object payload", () => {
    expect(() =>
      normalizeReviewResult("not json", {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      }),
    ).toThrow("invalid review");
  });

  it("skips malformed metrics and findings", () => {
    const result = normalizeReviewResult(
      {
        score: "10",
        summary: "Summary",
        rationale: "Evidence",
        metrics: [{ score: 1 }, { label: "Correctness", score: "10" }],
        findings: [
          { severity: "nope", title: "X", description: "Y", line: 1 },
          {
            severity: "info",
            title: "Keep",
            description: "Valid",
            line: "2",
          },
        ],
      },
      {
        lineCount: 4,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.score).toBe(10);
    expect(result.metrics).toEqual([
      {
        label: "Correctness",
        score: 10,
        description: undefined,
        snippet: undefined,
      },
    ]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: "suggestion",
      title: "Keep",
      line: 2,
    });
  });

  it("accepts a score-only payload with empty review fields", () => {
    const result = normalizeReviewResult(
      { score: 50 },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result).toMatchObject({
      score: 50,
      summary: "",
      rationale: "",
      metrics: [],
      findings: [],
    });
  });

  it("omits empty suggestions and clamps lines to 1", () => {
    const result = normalizeReviewResult(
      {
        score: -2,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          {
            label: "Correctness",
            score: 1,
            description: "ok",
            snippet: "pass",
          },
        ],
        findings: [
          {
            severity: "critical",
            title: "Issue",
            description: "Description",
            line: -4,
            suggestion: "",
          },
        ],
      },
      {
        lineCount: 0,
        durationMs: 8,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.score).toBe(0);
    expect(result.findings[0]).toMatchObject({
      line: 1,
      suggestion: undefined,
    });
    expect(result.rationale).toBe("Evidence");
    expect(result.durationMs).toBe(8);
  });

  it("merges later description and snippet onto the first canonical metric", () => {
    const result = normalizeReviewResult(
      {
        score: 80,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          { label: "Correctness", score: 80 },
          {
            label: "Correctness",
            score: 10,
            description: "Filled in later.",
            snippet: "return 1",
          },
        ],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.metrics).toEqual([
      {
        label: "Correctness",
        score: 80,
        description: "Filled in later.",
        snippet: "return 1",
      },
    ]);
  });

  it("averages named metric scores when the payload has no overall score", () => {
    const result = normalizeReviewResult(
      {
        Correctness: 90,
        Security: 40,
        Maintainability: 80,
        summary: "Mixed",
        rationale: "See metrics.",
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.score).toBe(70);
    expect(result.metrics.map((metric) => metric.label)).toEqual([
      "Correctness",
      "Security",
      "Maintainability",
    ]);
  });

  it("copies a shared description onto a lone named metric", () => {
    const result = normalizeReviewResult(
      {
        score: 80,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [{ description: "Shared evidence.", Correctness: 80 }],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.metrics).toEqual([
      {
        label: "Correctness",
        score: 80,
        description: "Shared evidence.",
        snippet: undefined,
      },
    ]);
  });

  it("reads a single metric object that is not wrapped in an array", () => {
    expect(collectMetrics({ label: "Correctness", score: 80 })).toEqual([
      {
        label: "Correctness",
        score: 80,
        description: undefined,
        snippet: undefined,
      },
    ]);
    expect(collectMetrics(null)).toEqual([]);
  });

  it("stringifies numeric summaries", () => {
    const result = normalizeReviewResult(
      { score: 40, summary: 12.5 },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );
    expect(result.summary).toBe("12.5");
  });

  it("omits metric description and snippet when they are not strings", () => {
    const result = normalizeReviewResult(
      {
        score: 40,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          {
            label: "Correctness",
            score: 40,
            description: 12,
            snippet: null,
          },
        ],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 3,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.metrics[0]).toEqual({
      label: "Correctness",
      score: 40,
      description: undefined,
      snippet: undefined,
    });
  });

  it("fills description and snippet from a later duplicate metric", () => {
    const result = normalizeReviewResult(
      {
        score: 80,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          { label: "Correctness", score: 80 },
          {
            label: "correctness",
            score: 10,
            description: "Later detail",
            snippet: "return x",
          },
        ],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );

    expect(result.metrics).toEqual([
      {
        label: "Correctness",
        score: 80,
        description: "Later detail",
        snippet: "return x",
      },
    ]);
  });

  it("accepts a metrics object, named scores, and a score inferred from metrics", () => {
    const mapped = normalizeReviewResult(
      {
        score: 75,
        summary: "Summary",
        rationale: "Evidence",
        metrics: { label: "Security", score: 40, description: "Risk" },
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );
    expect(mapped.metrics).toEqual([
      {
        label: "Security",
        score: 40,
        description: "Risk",
        snippet: undefined,
      },
    ]);

    const named = normalizeReviewResult(
      {
        score: 82,
        summary: "Summary",
        rationale: "Evidence",
        metrics: [{ Correctness: 82, description: "Happy path." }],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );
    expect(named.metrics).toEqual([
      {
        label: "Correctness",
        score: 82,
        description: "Happy path.",
        snippet: undefined,
      },
    ]);

    const averaged = normalizeReviewResult(
      {
        summary: "Summary",
        rationale: "Evidence",
        metrics: [
          { label: "Correctness", score: 90 },
          { label: "Security", score: 40 },
        ],
        findings: [],
      },
      {
        lineCount: 1,
        durationMs: 1,
        maxFindings: 3,
        inference,
        createId: () => "id",
      },
    );
    expect(averaged.score).toBe(65);
  });
});
