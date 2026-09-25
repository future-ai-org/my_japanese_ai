import { beforeEach, describe, expect, it, vi } from "vitest";

const { reviewCode, reviewCodeCloud } = vi.hoisted(() => ({
  reviewCode: vi.fn(),
  reviewCodeCloud: vi.fn(),
}));

vi.mock("../src/services/review", () => ({ reviewCode }));
vi.mock("../src/services/reviewCloud", () => ({ reviewCodeCloud }));

import { runReview } from "../src/services/reviewRunner";

describe("runReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes browser reviews to WebLLM", async () => {
    reviewCode.mockResolvedValue({ score: 1 });
    const request = { language: "python" as const, code: "pass" };
    await runReview("browser", request);
    expect(reviewCode).toHaveBeenCalledWith(
      request,
      undefined,
      undefined,
      undefined,
    );
    expect(reviewCodeCloud).not.toHaveBeenCalled();
  });

  it("routes configured providers to the cloud client", async () => {
    reviewCodeCloud.mockResolvedValue({ score: 1 });
    const request = { language: "typescript" as const, code: "const x = 1" };
    const onLog = vi.fn();
    await runReview("modal", request, undefined, onLog);
    expect(reviewCodeCloud).toHaveBeenCalledWith(
      { ...request, provider: "modal" },
      onLog,
      undefined,
    );
    expect(reviewCode).not.toHaveBeenCalled();
  });

  it("forwards local progress listeners only to WebLLM", async () => {
    reviewCode.mockResolvedValue({ score: 1 });
    const onProgress = vi.fn();
    const onLog = vi.fn();
    const request = { language: "python" as const, code: "pass" };
    await runReview("browser", request, onProgress, onLog);
    expect(reviewCode).toHaveBeenCalledWith(request, onProgress, onLog, undefined);
  });

  it("forwards an abort signal to both runtimes", async () => {
    reviewCode.mockResolvedValue({ score: 1 });
    reviewCodeCloud.mockResolvedValue({ score: 1 });
    const signal = new AbortController().signal;
    const request = { language: "python" as const, code: "pass" };
    await runReview("browser", request, undefined, undefined, signal);
    expect(reviewCode).toHaveBeenCalledWith(
      request,
      undefined,
      undefined,
      signal,
    );
    await runReview("custom", request, undefined, undefined, signal);
    expect(reviewCodeCloud).toHaveBeenCalledWith(
      { ...request, provider: "custom" },
      undefined,
      signal,
    );
  });
});
