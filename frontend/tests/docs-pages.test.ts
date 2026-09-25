import { describe, expect, it } from "vitest";
import {
  DOC_PAGES,
  docHash,
  docNavTree,
  extractHeadings,
  findDocPage,
  getAdjacentDocPages,
  getDocPage,
  parseDocHash,
  parseDocHref,
  slugify,
} from "../src/docs/pages";
import { docPath, isDashboardPath, parseDocPath } from "../src/docs/paths";

describe("documentation pages", () => {
  it("builds heading ids from titles", () => {
    expect(slugify("Browser · WebLLM")).toBe("browser-webllm");
    expect(slugify("`GET /api/history`")).toBe("get-apihistory");
  });

  it("skips headings inside fenced blocks", () => {
    const headings = extractHeadings(`# Title

## Visible

\`\`\`
## Hidden
\`\`\`

### Nested
`);

    expect(headings.map((heading) => heading.text)).toEqual([
      "Title",
      "Visible",
      "Nested",
    ]);
  });

  it("parses page and heading hashes", () => {
    expect(docHash("inference", "cloud-gpu")).toBe("#docs/inference/cloud-gpu");
    expect(parseDocHash("#docs/inference/cloud-gpu")).toEqual({
      pageId: "inference",
      headingId: "cloud-gpu",
    });
    expect(parseDocHash("#inference/cloud-gpu")).toEqual({
      pageId: "inference",
      headingId: "cloud-gpu",
    });
    expect(parseDocHash("")).toEqual({
      pageId: "overview",
      headingId: null,
    });
    expect(parseDocHash("#missing")).toEqual({
      pageId: "overview",
      headingId: null,
    });
  });

  it("resolves in-wiki markdown links", () => {
    expect(parseDocHref("./overview.md")).toEqual({
      pageId: "overview",
      headingId: null,
    });
    expect(parseDocHref("browser-webllm.md#goal")).toEqual({
      pageId: "browser-webllm",
      headingId: "goal",
    });
    expect(parseDocHref("https://huggingface.co")).toBeNull();
    expect(parseDocHref("missing.md")).toBeNull();
    expect(parseDocHref(undefined)).toBeNull();
    expect(parseDocHref("./taid.md")).toEqual({
      pageId: "taid",
      headingId: null,
    });
  });

  it("loads the documented wiki pages", () => {
    expect(DOC_PAGES.map((page) => page.id)).toEqual([
      "overview",
      "models",
      "tinyswallow",
      "inference",
      "browser-webllm",
      "modal-vllm",
      "huggingface-inference",
      "research",
      "taid",
    ]);
    expect(getDocPage("tinyswallow")?.title).toBe("TinySwallow-1.5B");
    expect(getDocPage("tinyswallow")?.parentId).toBe("models");
    expect(getDocPage("browser-webllm")?.parentId).toBe("inference");
    expect(getDocPage("modal-vllm")?.parentId).toBe("inference");
    expect(getDocPage("huggingface-inference")?.parentId).toBe("inference");
    expect(getDocPage("research")?.title).toBe("Research");
    expect(getDocPage("taid")?.title).toBe("TAID");
    expect(getDocPage("taid")?.parentId).toBe("research");
    expect(docNavTree().map((entry) => entry.page.id)).toEqual([
      "overview",
      "models",
      "inference",
      "research",
    ]);
    expect(
      docNavTree()
        .find((entry) => entry.page.id === "models")
        ?.children.map((child) => child.id),
    ).toEqual(["tinyswallow"]);
    expect(
      docNavTree()
        .find((entry) => entry.page.id === "inference")
        ?.children.map((child) => child.id),
    ).toEqual(["browser-webllm", "modal-vllm", "huggingface-inference"]);
    expect(
      docNavTree()
        .find((entry) => entry.page.id === "research")
        ?.children.map((child) => child.id),
    ).toEqual(["taid"]);
    expect(findDocPage("browser-webllm").id).toBe("browser-webllm");
    expect(findDocPage("missing").id).toBe("overview");
    expect(getDocPage("missing")).toBeUndefined();
    expect(
      findDocPage("browser-webllm").headings.map((heading) => heading.id),
    ).toContain("browser-webllm");
    expect(
      findDocPage("inference").headings.map((heading) => heading.id),
    ).toEqual(
      expect.arrayContaining([
        "comparison",
        "parameters",
        "temperature",
        "output-tokens",
        "cloud-only-request-limits",
      ]),
    );
    expect(findDocPage("browser-webllm").title).toBe("Browser (WebLLM)");
    expect(findDocPage("modal-vllm").title).toBe("Modal (dedicated vLLM)");
    expect(findDocPage("huggingface-inference").title).toBe(
      "Hugging Face (Inference Provider)",
    );
  });

  it("builds real documentation paths", () => {
    expect(docPath("inference", "cloud-gpu")).toBe("/docs/inference/cloud-gpu");
    expect(parseDocPath("/docs/inference/cloud-gpu")).toEqual({
      pageId: "inference",
      headingId: "cloud-gpu",
    });
    expect(parseDocPath("/docs")).toEqual({
      pageId: undefined,
      headingId: null,
    });
    expect(isDashboardPath("/dashboard")).toBe(true);
    expect(isDashboardPath("/review")).toBe(false);
  });

  it("returns null neighbors for unknown wiki pages", () => {
    expect(getAdjacentDocPages("missing")).toEqual({
      previous: null,
      next: null,
    });
    expect(getAdjacentDocPages("overview")).toEqual({
      previous: null,
      next: expect.objectContaining({ id: "models" }),
    });
  });
});
