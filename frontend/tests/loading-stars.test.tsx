import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingStars } from "../src/components/LoadingStars";

describe("LoadingStars", () => {
  it("renders a purple star constellation for the loading mark", () => {
    const { container } = render(<LoadingStars />);
    const svg = container.querySelector("svg.scan-mark__stars");
    expect(svg).not.toBeNull();
    expect(container.querySelectorAll(".scan-mark__star")).toHaveLength(3);
  });
});
