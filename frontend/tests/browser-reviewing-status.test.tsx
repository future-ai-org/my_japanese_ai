import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrowserReviewingStatus } from "../src/components/BrowserReviewingStatus";
import { REVIEW_CONFIG } from "../src/config/review";

describe("BrowserReviewingStatus", () => {
  it("shows elapsed time and review facts without phase notes or inline activity", () => {
    render(
      <BrowserReviewingStatus
        model={REVIEW_CONFIG.model}
        progress={{
          progress: 1,
          text: "Prefilling the prompt on WebGPU…",
          elapsedSeconds: 12.4,
        }}
        languageLabel="Polite"
        lineCount={24}
        characterCount={812}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("12s elapsed")).toBeInTheDocument();
    expect(within(status).getByText(REVIEW_CONFIG.model.label)).toBeInTheDocument();
    expect(
      within(status).queryByText("Prefilling the prompt on WebGPU"),
    ).not.toBeInTheDocument();
    expect(
      within(status).queryByText("Prefilling the prompt on WebGPU…"),
    ).not.toBeInTheDocument();
    expect(
      within(status).getByText(/WebLLM still prefills your prompt/),
    ).toBeInTheDocument();
    expect(within(status).getByText("Polite")).toBeInTheDocument();
    expect(within(status).getByText("24 lines · 812 characters")).toBeInTheDocument();
    expect(
      within(status).getByText(
        `Context: ${REVIEW_CONFIG.model.contextWindowSize.toLocaleString()} tokens`,
      ),
    ).toBeInTheDocument();
    expect(within(status).getByText("Temp 0.2")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("ticks elapsed time when progress has no clock", () => {
    render(
      <BrowserReviewingStatus
        progress={{ progress: 1, text: "Submitting the streaming inference request." }}
        languageLabel="TypeScript"
        lineCount={1}
        characterCount={4}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("0.0s elapsed")).toBeInTheDocument();
    expect(
      within(status).queryByText("Submitting the lesson to the local model"),
    ).not.toBeInTheDocument();
    expect(
      within(status).getByText(/WebLLM still prefills your prompt/),
    ).toBeInTheDocument();
  });

  it("explains token streaming once generation has started", () => {
    render(
      <BrowserReviewingStatus
        progress={{
          progress: 1,
          text: "Generating the lesson…",
          streamedText: '{"translation":',
          elapsedSeconds: 6,
        }}
        languageLabel="Polite"
        lineCount={8}
        characterCount={120}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(
      within(status).queryByText("Generating lesson tokens"),
    ).not.toBeInTheDocument();
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
        languageLabel="Polite"
        lineCount={8}
        characterCount={120}
        temperature={0.2}
      />,
    );

    const status = screen.getByRole("status");
    expect(
      within(status).queryByText("Validating the lesson JSON"),
    ).not.toBeInTheDocument();
    expect(
      within(status).getByText(/Tokens are streaming from the local model/),
    ).toBeInTheDocument();
  });
});
