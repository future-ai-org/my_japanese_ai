import { describe, expect, it } from "vitest";
import {
  appendReviewLog,
  recentActivityLogs,
} from "../src/review/activityLog";
import type { ReviewLogEntry } from "../src/types/review";

function log(
  id: string,
  stage: string,
  message: string,
): ReviewLogEntry {
  return {
    id,
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "info",
    stage,
    message,
  };
}

describe("activity log", () => {
  it("drops consecutive copies of the same stage and message", () => {
    const first = log("a", "review", "Starting a local code review.");
    const copy = log("b", "review", "Starting a local code review.");
    const next = log(
      "c",
      "generation",
      "Local model is ready. Prefilling the prompt on WebGPU.",
    );

    expect(appendReviewLog([], first, 6)).toEqual([first]);
    expect(appendReviewLog([first], copy, 6)).toEqual([first]);
    expect(appendReviewLog([first], next, 6)).toEqual([first, next]);
  });

  it("hides repeated activity lines while keeping later distinct events", () => {
    const logs = [
      log("a", "review", "Starting a local code review."),
      log("b", "review", "Starting a local code review."),
      log("c", "model-load", "Downloading weights"),
      log(
        "d",
        "generation",
        "Local model is ready. Prefilling the prompt on WebGPU.",
      ),
      log(
        "e",
        "generation",
        "Local model is ready. Prefilling the prompt on WebGPU.",
      ),
    ];

    expect(
      recentActivityLogs(logs, (stage) => stage !== "model-load", 6).map(
        (entry) => entry.id,
      ),
    ).toEqual(["a", "d"]);
  });

  it("drops WebLLM cache-load ticks instead of repeating them", () => {
    const tick =
      "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.";
    const storage = log("s", "storage", "Browser model storage availability.");
    const cacheA = log("a", "model-load", tick);
    const cacheB = log("b", "model-load", tick.replace("[1/30]", "[2/30]"));

    expect(appendReviewLog([storage], cacheA, 6)).toEqual([storage]);
    expect(
      recentActivityLogs(
        [storage, cacheA, cacheB],
        (stage) => stage === "storage" || stage === "model-load",
        6,
      ).map((entry) => entry.id),
    ).toEqual(["s"]);
  });

  it("collapses model-load lines that only differ by counters", () => {
    const first = log("a", "model-load", "Loading model parameters 1");
    const next = log("b", "model-load", "Loading model parameters 2");
    expect(appendReviewLog([first], next, 6)).toEqual([first]);
  });
});

