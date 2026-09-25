import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Cpu } from "lucide-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ProviderSelect } from "../src/components/ProviderSelect";

function ModelSelect() {
  const [value, setValue] = useState("");
  return (
    <ProviderSelect
      icon={<Cpu size={15} />}
      prefix="Model"
      ariaLabel="Review model"
      value={value}
      displayValue={value || "Select a model"}
      placeholder={!value}
      options={[
        { id: "", label: "Select a model", disabled: true },
        { id: "tiny", label: "WebLLM", hint: "(Recommended)" },
        { id: "cloud", label: "Cloud model" },
      ]}
      onChange={setValue}
    />
  );
}

describe("ProviderSelect", () => {
  it("opens the model menu below the toggle", async () => {
    const view = userEvent.setup();
    render(<ModelSelect />);

    const toggle = screen.getByLabelText("Review model");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await view.click(toggle);
    const menu = screen.getByRole("listbox");
    expect(
      toggle.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(menu).toHaveClass("provider-summary__menu");

    const recommended = within(menu).getByRole("option", {
      name: /WebLLM/,
    });
    expect(recommended).toHaveTextContent("(Recommended)");
    expect(
      recommended.querySelector(".provider-summary__menu-hint"),
    ).toHaveTextContent("(Recommended)");

    await view.click(recommended);
    expect(toggle).toHaveValue("tiny");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens from the keyboard and closes on escape or outside click", async () => {
    const view = userEvent.setup();
    render(<ModelSelect />);
    const toggle = screen.getByLabelText("Review model");

    fireEvent.keyDown(toggle, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await view.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(toggle, { key: " " });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(toggle, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
