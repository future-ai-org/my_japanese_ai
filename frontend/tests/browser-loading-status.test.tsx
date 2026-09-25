import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrowserLoadingStatus } from "../src/components/BrowserLoadingStatus";
import { REVIEW_CONFIG } from "../src/config/review";

describe("BrowserLoadingStatus", () => {
  it("shows percent, phase, model facts, and recent load activity", () => {
    render(
      <BrowserLoadingStatus
        model={REVIEW_CONFIG.model}
        progress={{
          progress: 0.4,
          text: "Downloading weights",
          elapsedSeconds: 12.4,
        }}
        logs={[
          {
            id: "log-storage",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "storage",
            message: "Browser model storage availability.",
          },
          {
            id: "log-review",
            timestamp: "2026-01-01T00:00:01.000Z",
            level: "info",
            stage: "review",
            message: "Starting a local code review.",
          },
          {
            id: "log-load",
            timestamp: "2026-01-01T00:00:02.000Z",
            level: "debug",
            stage: "model-load",
            message: "Downloading weights",
          },
          {
            id: "log-cache-a",
            timestamp: "2026-01-01T00:00:03.000Z",
            level: "debug",
            stage: "model-load",
            message:
              "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
          },
          {
            id: "log-cache-b",
            timestamp: "2026-01-01T00:00:04.000Z",
            level: "debug",
            stage: "model-load",
            message:
              "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
          },
        ]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("40%")).toBeInTheDocument();
    expect(within(status).getByText("12s elapsed")).toBeInTheDocument();
    expect(
      within(status).getByText("Downloading model weights"),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(
        `Download ~${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(
        `Cache: ${REVIEW_CONFIG.storage.cacheBackend} · VRAM: ${REVIEW_CONFIG.model.vramRequiredMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();

    const activity = screen.getByRole("list", { name: "Load activity" });
    expect(
      within(activity).getByText("Browser model storage availability."),
    ).toBeInTheDocument();
    expect(within(activity).getByText("Downloading weights")).toBeInTheDocument();
    expect(
      within(activity).queryByText(/Loading model from cache/),
    ).not.toBeInTheDocument();
    expect(
      within(activity).queryByText("Starting a local code review."),
    ).not.toBeInTheDocument();
  });

  it("hides WebLLM cache-load ticks and does not list them in activity", () => {
    const tick =
      "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.";
    render(
      <BrowserLoadingStatus
        model={REVIEW_CONFIG.model}
        progress={{ progress: 0.1, text: tick, elapsedSeconds: 0 }}
        logs={[
          {
            id: "log-cache-a",
            timestamp: "2026-01-01T00:00:03.000Z",
            level: "debug",
            stage: "model-load",
            message: tick,
          },
          {
            id: "log-cache-b",
            timestamp: "2026-01-01T00:00:04.000Z",
            level: "debug",
            stage: "model-load",
            message: tick,
          },
        ]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).queryByText(tick)).not.toBeInTheDocument();
    expect(
      within(status).getByText("Loading weights from cache"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Load activity" }),
    ).not.toBeInTheDocument();
  });
});
