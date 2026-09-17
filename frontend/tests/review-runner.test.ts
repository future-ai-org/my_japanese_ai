import { beforeEach, describe, expect, it, vi } from "vitest";

const { reviewCode } = vi.hoisted(() => ({
  reviewCode: vi.fn(),
}));

vi.mock("../src/services/review", () => ({ reviewCode }));

import { runReview } from "../src/services/reviewRunner";

describe("runReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes reviews to WebLLM", async () => {
    reviewCode.mockResolvedValue({ translation: "x" });
    const request = { language: "polite" as const, code: "pass" };
    await runReview(request);
    expect(reviewCode).toHaveBeenCalledWith(
      request,
      undefined,
      undefined,
      undefined,
    );
  });

  it("forwards progress and log listeners", async () => {
    reviewCode.mockResolvedValue({ translation: "x" });
    const onProgress = vi.fn();
    const onLog = vi.fn();
    const request = { language: "polite" as const, code: "pass" };
    await runReview(request, onProgress, onLog);
    expect(reviewCode).toHaveBeenCalledWith(request, onProgress, onLog, undefined);
  });

  it("forwards an abort signal", async () => {
    reviewCode.mockResolvedValue({ translation: "x" });
    const signal = new AbortController().signal;
    const request = { language: "polite" as const, code: "pass" };
    await runReview(request, undefined, undefined, signal);
    expect(reviewCode).toHaveBeenCalledWith(
      request,
      undefined,
      undefined,
      signal,
    );
  });
});
