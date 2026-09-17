import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastHost } from "../src/components/ToastHost";
import { ToastProvider, useToast } from "../src/context/ToastContext";

function Trigger() {
  const { pushToast } = useToast();
  return (
    <button type="button" onClick={() => pushToast("error", "Disk full")}>
      Toast
    </button>
  );
}

describe("toasts", () => {
  it("shows and dismisses a notification", async () => {
    const view = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
        <ToastHost />
      </ToastProvider>,
    );
    await view.click(screen.getByRole("button", { name: "Toast" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Disk full");
    await view.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no-ops when used outside a provider", () => {
    function Probe() {
      const { toasts, pushToast, dismissToast } = useToast();
      pushToast("success", "ignored");
      dismissToast("missing");
      return <div>count:{toasts.length}</div>;
    }
    render(<Probe />);
    expect(screen.getByText("count:0")).toBeInTheDocument();
  });
});
