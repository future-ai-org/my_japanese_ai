import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreamPreview } from "../src/components/StreamPreview";

describe("StreamPreview", () => {
  it("renders streamed text in a scrollable log", () => {
    const { rerender } = render(<StreamPreview text={'{"translation": 1'} />);
    const preview = screen.getByRole("log", { name: "Generated lesson output" });
    expect(preview).toHaveClass("stream-preview");
    expect(preview).toHaveTextContent('{"translation": 1');
    expect(preview).toHaveAttribute("tabindex", "0");

    rerender(<StreamPreview text={'{"translation": 12}'} />);
    expect(preview).toHaveTextContent('{"translation": 12}');
  });

  it("stops following the bottom after the user scrolls up", () => {
    const { rerender } = render(<StreamPreview text="first" />);
    const preview = screen.getByRole("log", { name: "Generated lesson output" });
    Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 400 });
    Object.defineProperty(preview, "clientHeight", { configurable: true, value: 80 });
    Object.defineProperty(preview, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.scroll(preview);
    rerender(<StreamPreview text="second" />);
    expect(preview.scrollTop).toBe(0);

    preview.scrollTop = 330;
    fireEvent.scroll(preview);
    rerender(<StreamPreview text="third" />);
    expect(preview.scrollTop).toBe(400);
  });
});
