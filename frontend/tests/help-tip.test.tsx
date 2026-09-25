import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpTip } from "../src/components/HelpTip";

describe("HelpTip", () => {
  it("exposes help text as a tooltip and description when focused", async () => {
    const view = userEvent.setup();
    render(
      <HelpTip id="limit-help" help="Max source characters." tabIndex={0}>
        Limit: 4,000 characters
      </HelpTip>,
    );

    expect(screen.getByText("Limit: 4,000 characters")).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Max source characters.",
      }),
    ).toBeInTheDocument();

    await view.tab();
    expect(screen.getByText("Limit: 4,000 characters").parentElement).toHaveFocus();
    expect(screen.getByText("Limit: 4,000 characters").parentElement).toHaveAccessibleDescription(
      "Max source characters.",
    );
  });
});
