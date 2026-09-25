import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { LanguageSelect } from "../src/components/LanguageSelect";
import type { Language } from "../src/types/review";

function Select({ initial = "python" as Language }) {
  const [value, setValue] = useState<Language>(initial);
  return (
    <LanguageSelect
      value={value}
      ariaLabel="Programming language"
      onChange={setValue}
    />
  );
}

describe("LanguageSelect", () => {
  it("opens the menu, selects a language, and shows the extension", async () => {
    const view = userEvent.setup();
    render(<Select />);

    const toggle = screen.getByLabelText("Programming language");
    expect(toggle).toHaveValue("python");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.mouseDown(toggle);
    const menu = screen.getByRole("listbox");
    expect(
      within(menu).getByRole("option", { name: /Python/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(within(menu).getByText(".py")).toBeInTheDocument();
    expect(within(menu).getByText(".go")).toBeInTheDocument();

    await view.click(within(menu).getByRole("option", { name: /Go/ }));
    expect(toggle).toHaveValue("go");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(toggle.closest(".language-select")).toHaveAttribute(
      "data-language",
      "go",
    );
  });

  it("opens from the keyboard and closes on escape, outside click, or toggle", async () => {
    const view = userEvent.setup();
    render(<Select />);
    const toggle = screen.getByLabelText("Programming language");

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
    fireEvent.mouseDown(toggle);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the native select change path for tests and assistive tech", () => {
    render(<Select />);
    const toggle = screen.getByLabelText("Programming language");
    fireEvent.change(toggle, { target: { value: "rust" } });
    expect(toggle).toHaveValue("rust");
  });
});
