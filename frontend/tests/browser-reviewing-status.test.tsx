import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrowserReviewingStatus } from "../src/components/BrowserReviewingStatus";
import { REVIEW_CONFIG } from "../src/config/review";

describe("BrowserReviewingStatus", () => {
  it("shows elapsed time, prefill details, review facts, and recent activity", () => {
    render(
      <BrowserReviewingStatus
        model={REVIEW_CONFIG.model}
        progress={{
          progress: 1,
          text: "Prefilling the prompt on WebGPU…",
          elapsedSeconds: 12.4,
        }}
        logs={[
          {
            id: "log-review",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "review",
            message: "Starting a local code review.",
          },
          {
            id: "log-review-dup",
            timestamp: "2026-01-01T00:00:00.100Z",
            level: "info",
            stage: "review",
            message: "Starting a local code review.",
          },
          {
            id: "log-load",
            timestamp: "2026-01-01T00:00:01.000Z",
            level: "debug",
            stage: "model-load",
            message: "Downloading weights",
          },
          {
            id: "log-generation",
            timestamp: "2026-01-01T00:00:02.000Z",
            level: "info",
            stage: "generation",
            message: "Local model is ready. Prefilling the prompt on WebGPU.",
          },
        ]}
        languageLabel="Python"
        lineCount={24}
        characterCount={812}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("12s elapsed")).toBeInTheDocument();
    expect(within(status).getByText(REVIEW_CONFIG.model.label)).toBeInTheDocument();
    expect(
      within(status).getByText("Prefilling the prompt on WebGPU"),
    ).toBeInTheDocument();
    expect(
      within(status).queryByText("Prefilling the prompt on WebGPU…"),
    ).not.toBeInTheDocument();
    expect(
      within(status).getByText(/WebLLM still prefills your prompt/),
    ).toBeInTheDocument();
    expect(within(status).getByText("Python")).toBeInTheDocument();
    expect(within(status).getByText("24 lines · 812 characters")).toBeInTheDocument();
    expect(
      within(status).getByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(
        `Context: ${REVIEW_CONFIG.model.contextWindowSize.toLocaleString()} tokens`,
      ),
    ).toBeInTheDocument();
    expect(within(status).getByText("Temp 0.2")).toBeInTheDocument();

    const activity = screen.getByRole("list", { name: "Review activity" });
    expect(
      within(activity).getAllByText("Starting a local code review."),
    ).toHaveLength(1);
    expect(
      within(activity).getByText(
        "Local model is ready. Prefilling the prompt on WebGPU.",
      ),
    ).toBeInTheDocument();
    expect(
      within(activity).queryByText("Downloading weights"),
    ).not.toBeInTheDocument();
  });

  it("ticks elapsed time when progress has no clock", () => {
    render(
      <BrowserReviewingStatus
        progress={{ progress: 1, text: "Submitting the streaming inference request." }}
        logs={[]}
        languageLabel="TypeScript"
        lineCount={1}
        characterCount={4}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("0.0s elapsed")).toBeInTheDocument();
    expect(
      within(status).getByText("Submitting the review to the local model"),
    ).toBeInTheDocument();
  });

  it("explains token streaming once generation has started", () => {
    render(
      <BrowserReviewingStatus
        progress={{
          progress: 1,
          text: "Generating the review…",
          streamedText: '{"score":',
          elapsedSeconds: 6,
        }}
        logs={[]}
        languageLabel="Python"
        lineCount={8}
        characterCount={120}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("Generating review tokens")).toBeInTheDocument();
    expect(
      within(status).getByText(/Tokens are streaming from the local model/),
    ).toBeInTheDocument();
  });

  it("shows validation copy after the review JSON is complete", () => {
    render(
      <BrowserReviewingStatus
        progress={{
          progress: 1,
          text: "Review output validated.",
          elapsedSeconds: 9,
        }}
        logs={[]}
        languageLabel="Python"
        lineCount={8}
        characterCount={120}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("Validating the review JSON")).toBeInTheDocument();
    expect(
      within(status).getByText(/Tokens are streaming from the local model/),
    ).toBeInTheDocument();
  });
});
