import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

function Boom() {
  throw new Error("crash");
}

describe("ErrorBoundary", () => {
  it("renders a recovery fallback", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("The application hit an unexpected error.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Reload to continue from a clean state/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
    screen.getByRole("button", { name: "Reload" }).click();
    expect(reload).toHaveBeenCalled();
    error.mockRestore();
  });
});
