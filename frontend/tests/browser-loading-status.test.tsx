import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrowserLoadingStatus } from "../src/components/BrowserLoadingStatus";
import { REVIEW_CONFIG } from "../src/config/review";

describe("BrowserLoadingStatus", () => {
  it("shows percent and model facts without phase notes or inline activity", () => {
    render(
      <BrowserLoadingStatus
        model={REVIEW_CONFIG.model}
        progress={{
          progress: 0.4,
          text: "Downloading weights",
          elapsedSeconds: 12.4,
        }}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("40%")).toBeInTheDocument();
    expect(within(status).getByText("12s elapsed")).toBeInTheDocument();
    expect(within(status).queryByText("Downloading model weights")).not.toBeInTheDocument();
    expect(within(status).queryByText("Downloading weights")).not.toBeInTheDocument();
    expect(
      within(status).getByText(
        `Download ~${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(
        `Cache: VRAM ${REVIEW_CONFIG.model.vramRequiredMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("hides WebLLM cache-load ticks from the status copy", () => {
    const tick =
      "Loading model from cache[1/30]: 0MB loaded. 0% completed, 0 secs elapsed.";
    render(
      <BrowserLoadingStatus
        model={REVIEW_CONFIG.model}
        progress={{ progress: 0.1, text: tick, elapsedSeconds: 0 }}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).queryByText(tick)).not.toBeInTheDocument();
    expect(
      within(status).queryByText("Loading weights from cache"),
    ).not.toBeInTheDocument();
    expect(within(status).getByText("0.0s elapsed")).toBeInTheDocument();
  });
});
