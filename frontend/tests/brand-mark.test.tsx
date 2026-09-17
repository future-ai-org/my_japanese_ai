import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "../src/components/BrandMark";

describe("BrandMark", () => {
  it("renders the product name by default", () => {
    render(<BrandMark />);
    expect(screen.getByLabelText("my japanese AI")).toHaveTextContent(
      "my japanese AI",
    );
  });

  it("hides the product name when compact", () => {
    render(<BrandMark compact />);
    expect(screen.getByLabelText("my japanese AI")).not.toHaveTextContent("my");
  });
});
