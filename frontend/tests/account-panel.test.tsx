import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPanel } from "../src/components/AccountPanel";
import { user } from "./fixtures";

const { exportAccount, deleteAccount } = vi.hoisted(() => ({
  exportAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../src/services/auth", () => ({
  exportAccount,
  deleteAccount,
}));

describe("AccountPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports data and deletes the account", async () => {
    exportAccount.mockResolvedValue({
      exportedAt: "2026-01-01T00:00:00.000Z",
      user,
      reviews: [],
    });
    deleteAccount.mockResolvedValue(undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onDeleted = vi.fn();
    const view = userEvent.setup();

    render(<AccountPanel user={user} onDeleted={onDeleted} />);
    expect(screen.getByRole("heading", { name: "M" }).closest(".account-heading")).toContainElement(
      screen.getByRole("button", { name: "Export my data" }),
    );
    await view.click(screen.getByRole("button", { name: "Export my data" }));
    expect(exportAccount).toHaveBeenCalled();
    expect(
      screen.getByText("A copy of your account data was downloaded."),
    ).toBeInTheDocument();

    await view.type(screen.getByLabelText("Confirm password"), "password1");
    await view.click(screen.getByRole("button", { name: "Delete account" }));
    expect(deleteAccount).toHaveBeenCalledWith("password1");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("surfaces export and delete failures", async () => {
    exportAccount.mockRejectedValueOnce(new Error("Could not export account data."));
    deleteAccount.mockRejectedValueOnce("offline");
    const onDeleted = vi.fn();
    const view = userEvent.setup();
    render(<AccountPanel user={user} onDeleted={onDeleted} />);

    await view.click(screen.getByRole("button", { name: "Export my data" }));
    expect(screen.getByText("Could not export account data.")).toBeInTheDocument();

    await view.type(screen.getByLabelText("Confirm password"), "password1");
    await view.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByText("Could not delete the account.")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
