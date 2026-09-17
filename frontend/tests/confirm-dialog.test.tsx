import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../src/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("confirms, cancels, and closes on escape", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const view = userEvent.setup();
    render(
      <ConfirmDialog
        title="Delete this lesson?"
        body="Gone for good."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await view.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
    await view.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    await view.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
