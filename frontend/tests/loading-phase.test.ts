import { describe, expect, it } from "vitest";
import {
  browserLoadingPhase,
  isWebLlmProgressTick,
  progressLogFingerprint,
  webLlmProgressRatio,
} from "../src/review/loadingPhase";

describe("browserLoadingPhase", () => {
  it("maps WebLLM and local progress text onto loading phases", () => {
    expect(browserLoadingPhase("Checking browser storage…")).toBe("storage");
    expect(browserLoadingPhase("Selecting a WebGPU adapter (Apple)")).toBe(
      "gpu",
    );
    expect(browserLoadingPhase("WebGPU is using a software adapter.")).toBe(
      "gpu",
    );
    expect(browserLoadingPhase("Fetching param cache[3/30]: 80MB fetched.")).toBe(
      "download",
    );
    expect(browserLoadingPhase("Prefetching model artifacts…")).toBe("download");
    expect(browserLoadingPhase("Loading model from cache[3/30]: 80MB loaded.")).toBe(
      "cache",
    );
    expect(browserLoadingPhase("Opening the cache")).toBe("cache");
    expect(browserLoadingPhase("Downloading weights")).toBe("download");
    expect(browserLoadingPhase("Loading model parameters")).toBe("weights");
    expect(browserLoadingPhase("Compiling shaders")).toBe("shaders");
    expect(browserLoadingPhase("Finish loading")).toBe("ready");
    expect(browserLoadingPhase("Preparing the local model…")).toBe("other");
  });

  it("treats shard counters and byte ticks as the same cache-load event", () => {
    expect(
      progressLogFingerprint(
        "Loading model from cache[29/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    ).toBe(
      progressLogFingerprint(
        "Loading model from cache[30/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    );
    expect(
      progressLogFingerprint("Fetching param cache[3/30]: 80MB fetched."),
    ).not.toBe(
      progressLogFingerprint("Loading model from cache[3/30]: 80MB loaded."),
    );
  });

  it("treats WebLLM shard counters as progress ticks", () => {
    expect(
      isWebLlmProgressTick(
        "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    ).toBe(true);
    expect(isWebLlmProgressTick("50% completed")).toBe(true);
    expect(isWebLlmProgressTick("Downloading weights")).toBe(false);
  });

  it("derives cache-load progress from shard counters when bytes stay at 0", () => {
    expect(
      webLlmProgressRatio(
        0,
        "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    ).toBeCloseTo(1 / 30);
    expect(
      webLlmProgressRatio(
        0,
        "Loading model from cache[29/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    ).toBeCloseTo(29 / 30);
    expect(
      webLlmProgressRatio(
        0,
        "Loading model from cache[30/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
      ),
    ).toBe(1);
    expect(
      webLlmProgressRatio(0.8, "Fetching param cache[3/30]: 80MB fetched."),
    ).toBe(0.8);
    expect(webLlmProgressRatio(0.4, "Downloading weights")).toBe(0.4);
    expect(webLlmProgressRatio(0.25, "Loading model from cache[1/0]:")).toBe(
      0.25,
    );
  });
});
