import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelDiagnostics } from "../src/components/ModelDiagnostics";
import { logEntry } from "./fixtures";

describe("ModelDiagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty collapsed panel for local reviews", () => {
    render(
      <ModelDiagnostics
        provider="browser"
        entries={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Local model logs")).toBeInTheDocument();
    expect(
      screen.getByText("Run a review to collect model logs."),
    ).toBeInTheDocument();
  });

  it("copies and formats expanded cloud logs next to close", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText },
    });
    const circular: { self?: unknown } = {};
    circular.self = circular;

    render(
      <ModelDiagnostics
        provider="modal"
        onClose={vi.fn()}
        entries={[
          { ...logEntry, details: undefined },
          logEntry,
          {
            id: "log-2",
            timestamp: "2026-01-01T00:00:01.000Z",
            level: "debug",
            stage: "cloud-http",
            message: "plain details",
            details: "raw body",
          },
          {
            id: "log-3",
            timestamp: "2026-01-01T00:00:02.000Z",
            level: "warning",
            stage: "cloud-http",
            message: "circular details",
            details: circular,
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Cloud inference logs")).toBeInTheDocument();
    expect(screen.queryByText(/log entries/)).not.toBeInTheDocument();
    expect(screen.getByText("plain details")).toBeInTheDocument();
    expect(screen.getByText("raw body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy logs" }).compareDocumentPosition(
        screen.getByRole("button", { name: "Close logs" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy logs" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText("Copied")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Copy logs")).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it("closes the panel from the header", () => {
    const onClose = vi.fn();
    render(
      <ModelDiagnostics
        provider="browser"
        entries={[]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close logs" }));
    expect(onClose).toHaveBeenCalled();
  });
});
