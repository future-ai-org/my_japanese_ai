import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownDoc } from "../src/docs/MarkdownDoc";
import { resolveDocAssetSrc } from "../src/docs/resolveDocAssetSrc";

describe("MarkdownDoc", () => {
  it("turns wiki links into in-app navigation and leaves external links alone", async () => {
    const onNavigate = vi.fn();
    const view = userEvent.setup();
    render(
      <MarkdownDoc
        onNavigate={onNavigate}
        source={`# Browser · **WebLLM**

See [Overview](./overview.md#goal) and [Hugging Face](https://huggingface.co).
`}
      />,
    );

    expect(screen.getByRole("heading", { name: "Browser · WebLLM" })).toBeInTheDocument();
    expect(document.getElementById("browser-webllm")).toBeNull();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/docs/overview/goal",
    );
    await view.click(screen.getByRole("link", { name: "Overview" }));
    expect(onNavigate).toHaveBeenCalledWith("overview", "goal");

    const external = screen.getByRole("link", { name: "Hugging Face" });
    expect(external).toHaveAttribute("href", "https://huggingface.co");
    expect(external).toHaveAttribute("target", "_blank");
  });

  it("ignores non-text heading children when building ids", () => {
    render(
      <MarkdownDoc
        onNavigate={vi.fn()}
        source={`## ![](https://example.com/mark.png)\n`}
      />,
    );
    expect(document.querySelector("h2")).toBeTruthy();
  });

  it("resolves documentation asset images", () => {
    expect(resolveDocAssetSrc(undefined)).toBeUndefined();
    expect(resolveDocAssetSrc("https://example.com/mark.png")).toBe(
      "https://example.com/mark.png",
    );
    expect(resolveDocAssetSrc("./assets/missing.png")).toBe("./assets/missing.png");

    const resolved = resolveDocAssetSrc("./assets/distillation.png");
    expect(resolved).toBeTruthy();
    expect(resolved).not.toBe("./assets/distillation.png");
    expect(resolveDocAssetSrc("assets/distillation.png")).toBe(resolved);
    expect(resolveDocAssetSrc("../assets/distillation.png")).toBe(resolved);

    render(
      <MarkdownDoc
        onNavigate={vi.fn()}
        source={`![TAID](./assets/distillation.png)\n\n![](./assets/distillation.png)\n`}
      />,
    );
    expect(screen.getByRole("img", { name: "TAID" })).toHaveAttribute(
      "src",
      resolved,
    );
    expect(screen.getByRole("presentation")).toHaveAttribute("src", resolved);
  });

  it("renders GFM tables", () => {
    render(
      <MarkdownDoc
        onNavigate={vi.fn()}
        source={`| | Browser | Modal |
| --- | --- | --- |
| **Where** | Device | Cloud |
`}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Browser" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Device" })).toBeInTheDocument();
  });

  it("renders HTML abbr tags as hover tips", () => {
    render(
      <MarkdownDoc
        onNavigate={vi.fn()}
        source={`Uses <abbr title="Learned parameters at 4-bit precision.">4-bit weights</abbr>.\n`}
      />,
    );

    const tip = screen.getByText("4-bit weights");
    expect(tip.tagName).toBe("ABBR");
    expect(tip).toHaveAttribute(
      "title",
      "Learned parameters at 4-bit precision.",
    );
  });
});
