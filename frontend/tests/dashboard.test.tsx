import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "../src/components/Dashboard";
import { historySummary } from "./fixtures";

const actions = {
  isLoading: false,
  error: null,
  onOpen: vi.fn(),
  onStar: vi.fn(),
  onDelete: vi.fn(),
};

function renderDashboard(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Dashboard", () => {
  it("shows the library heading and empty state before any reviews are saved", () => {
    renderDashboard(<Dashboard entries={[]} {...actions} />);

    expect(
      screen.getByRole("heading", { name: "Your reviews" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No saved reviews yet")).toBeInTheDocument();
    expect(screen.queryByText(/Hello,/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run a Review" }),
    ).not.toBeInTheDocument();
  });

  it("lists saved reviews", () => {
    renderDashboard(
      <Dashboard
        entries={[
          historySummary,
          { ...historySummary, id: "second", score: 72 },
        ]}
        {...actions}
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: "Browser WebLLM Python",
      }),
    ).toHaveLength(2);
  });

  it("links to the account page", () => {
    renderDashboard(<Dashboard entries={[]} {...actions} />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });
});
