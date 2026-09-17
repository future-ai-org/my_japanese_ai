import { afterEach, describe, expect, it, vi } from "vitest";
import { createThrottledStreamProgress } from "../src/review/streamProgress";

describe("createThrottledStreamProgress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes the first chunk immediately and coalesces later chunks", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames[id - 1] = () => {};
    });
    const onProgress = vi.fn();
    const stream = createThrottledStreamProgress(onProgress);

    stream.push("a");
    stream.push("ab");
    stream.push("abc");
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ streamedText: "a" }),
    );

    stream.flush();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ streamedText: "abc" }),
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("publishes the latest chunk when the scheduled frame runs", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const onProgress = vi.fn();
    const stream = createThrottledStreamProgress(onProgress);

    stream.push("a");
    stream.push("ab");
    expect(onProgress).toHaveBeenCalledTimes(1);
    frames[0]?.(0);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ streamedText: "ab" }),
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending frame without publishing", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const onProgress = vi.fn();
    const stream = createThrottledStreamProgress(onProgress);

    stream.push("a");
    stream.push("ab");
    stream.cancel();
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
