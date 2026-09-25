import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CloudConnectingStatus } from "../src/components/CloudConnectingStatus";
import { modalProvider } from "./fixtures";

describe("CloudConnectingStatus", () => {
  it("shows elapsed time, GPU wait details, provider facts, and recent activity", () => {
    render(
      <CloudConnectingStatus
        provider={modalProvider}
        progress={{
          progress: 0,
          text: "Connecting to the cloud GPU",
          elapsedSeconds: 12.4,
        }}
        logs={[
          {
            id: "log-connect",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "cloud-request",
            message: "Connecting to the cloud GPU.",
          },
          {
            id: "log-review",
            timestamp: "2026-01-01T00:00:01.000Z",
            level: "info",
            stage: "review",
            message: "Starting a local code review.",
          },
          {
            id: "log-http",
            timestamp: "2026-01-01T00:00:02.000Z",
            level: "debug",
            stage: "cloud-http",
            message: "Retrying after retryable upstream status.",
          },
        ]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("12s")).toBeInTheDocument();
    expect(within(status).getByText("43s remaining")).toBeInTheDocument();
    expect(
      within(status).getByText("Waiting for a GPU worker"),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(/first review after idle/),
    ).toBeInTheDocument();
    expect(within(status).getByText("Modal GPU Cloud")).toBeInTheDocument();
    expect(
      within(status).getByText(`Model: ${modalProvider.modelId}`),
    ).toBeInTheDocument();
    expect(within(status).getByText("Timeout: 55s")).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "How long the API waits for a cloud review.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Per-user cloud review cap in this app.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Connecting to the cloud GPU" }),
    ).toHaveAttribute("aria-valuenow", "23");

    const activity = screen.getByRole("list", { name: "Connection activity" });
    expect(
      within(activity).getByText("Connecting to the cloud GPU."),
    ).toBeInTheDocument();
    expect(
      within(activity).getByText("Retrying after retryable upstream status."),
    ).toBeInTheDocument();
    expect(
      within(activity).queryByText("Starting a local code review."),
    ).not.toBeInTheDocument();
  });

  it("uses the UI name when the backend still sends the old provider label", () => {
    render(
      <CloudConnectingStatus
        provider={{ ...modalProvider, label: "Modal Cloud GPU" }}
        progress={{ progress: 0, text: "Connecting to the cloud GPU", elapsedSeconds: 1 }}
        logs={[]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("Modal GPU Cloud")).toBeInTheDocument();
    expect(within(status).queryByText("Modal Cloud GPU")).not.toBeInTheDocument();
  });

  it("explains a GPU boot when the worker is still starting", () => {
    render(
      <CloudConnectingStatus
        provider={modalProvider}
        progress={{
          progress: 0,
          text: "The provider is starting up.",
          elapsedSeconds: 8,
        }}
        logs={[]}
        starting
      />,
    );

    const status = screen.getByRole("status");
    expect(
      within(status).getByText("GPU worker is booting"),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(/API retries while the GPU container starts/),
    ).toBeInTheDocument();
    expect(
      within(status).getByText("The provider is starting up."),
    ).toBeInTheDocument();
  });

  it("shows overtime when the wait exceeds the provider timeout", () => {
    render(
      <CloudConnectingStatus
        provider={modalProvider}
        progress={{ progress: 0, text: "Connecting to the cloud GPU", elapsedSeconds: 60 }}
        logs={[]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("60s")).toBeInTheDocument();
    expect(
      within(status).getByText("Past the usual timeout"),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("ticks elapsed time when progress has no clock and omits provider facts", () => {
    render(
      <CloudConnectingStatus
        progress={{ progress: 0, text: "Connecting to the cloud GPU" }}
        logs={[]}
      />,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("0.0s")).toBeInTheDocument();
    expect(
      within(status).getByText("Sending the review to the API"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(status).queryByText("Modal GPU Cloud")).not.toBeInTheDocument();
  });
});
