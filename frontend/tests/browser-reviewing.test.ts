import { describe, expect, it } from "vitest";
import {
  BROWSER_PREFILL_PHASE_SECONDS,
  browserReviewingPhase,
} from "../src/review/browserReviewing";

describe("browser reviewing phases", () => {
  it("moves from submit to prefill after the first-token wait", () => {
    expect(browserReviewingPhase(0, { text: "Prefilling the prompt on WebGPU…" })).toBe(
      "prefill",
    );
    expect(browserReviewingPhase(0.2)).toBe("submit");
    expect(browserReviewingPhase(BROWSER_PREFILL_PHASE_SECONDS)).toBe("prefill");
    expect(
      browserReviewingPhase(0.2, { text: "Prefilling the prompt on WebGPU…" }),
    ).toBe("prefill");
  });

  it("treats streamed output as generation and validated JSON as the last phase", () => {
    expect(
      browserReviewingPhase(4, {
        text: "Generating the lesson…",
        streamedText: '{"translation":',
      }),
    ).toBe("generate");
    expect(browserReviewingPhase(8, { text: "Review output validated." })).toBe(
      "validate",
    );
  });
});
