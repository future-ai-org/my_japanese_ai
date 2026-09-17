import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefetchWebllmArtifacts = vi.fn();

vi.mock("../src/review/artifactPrefetch", () => ({
  prefetchWebllmArtifacts,
}));

describe("prefetch worker", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    prefetchWebllmArtifacts.mockReset();
    postMessage.mockReset();
    vi.stubGlobal("postMessage", postMessage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts progress and a done status when prefetch succeeds", async () => {
    prefetchWebllmArtifacts.mockImplementation(async (request) => {
      request.onProgress?.({ progress: 0.5, text: "halfway" });
      return "fetched";
    });

    await import("../src/workers/prefetch");
    const event = new MessageEvent("message", {
      data: {
        modelUrl: "https://example.test/model",
        wasmUrl: "https://example.test/lib.wasm",
        concurrency: 4,
      },
    });

    await self.onmessage?.(event);

    expect(prefetchWebllmArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        modelUrl: "https://example.test/model",
        wasmUrl: "https://example.test/lib.wasm",
        concurrency: 4,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith({
      type: "progress",
      progress: 0.5,
      text: "halfway",
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: "done",
      status: "fetched",
    });
  });

  it("posts an Error message when prefetch throws", async () => {
    prefetchWebllmArtifacts.mockRejectedValue(new Error("disk full"));

    await import("../src/workers/prefetch");
    await self.onmessage?.(
      new MessageEvent("message", {
        data: {
          modelUrl: "https://example.test/model",
          wasmUrl: "https://example.test/lib.wasm",
          concurrency: 2,
        },
      }),
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: "error",
      message: "disk full",
    });
  });

  it("stringifies non-Error failures", async () => {
    prefetchWebllmArtifacts.mockRejectedValue("offline");

    await import("../src/workers/prefetch");
    await self.onmessage?.(
      new MessageEvent("message", {
        data: {
          modelUrl: "https://example.test/model",
          wasmUrl: "https://example.test/lib.wasm",
          concurrency: 1,
        },
      }),
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: "error",
      message: "offline",
    });
  });
});
