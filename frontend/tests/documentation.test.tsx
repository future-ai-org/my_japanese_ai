import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Documentation } from "../src/components/Documentation";
import { DOC_PAGES } from "../src/docs/pages";

const inference = DOC_PAGES.find((page) => page.id === "inference")!;
const overview = DOC_PAGES.find((page) => page.id === "overview")!;

function renderDocs(path = "/docs/tinyswallow") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs/:pageId/:headingId" element={<Documentation />} />
        <Route path="/docs/:pageId" element={<Documentation />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Documentation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("renders the wiki summary and navigates between pages", async () => {
    const view = userEvent.setup();
    renderDocs();

    expect(screen.getByRole("heading", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TinySwallow-1.5B" })).toBeInTheDocument();
    await view.click(screen.getByRole("link", { name: overview.title }));
    expect(screen.getByRole("link", { name: overview.title })).toHaveClass(
      "is-active",
    );
  });

  it("opens TinySwallow-1.5B under Models", async () => {
    const view = userEvent.setup();
    renderDocs("/docs/models");

    expect(screen.getByRole("heading", { name: "Models" })).toBeInTheDocument();
    const modelsNav = screen.getByRole("navigation", { name: "Documentation" });
    expect(within(modelsNav).getByRole("link", { name: "Models" })).toHaveClass(
      "is-active",
    );
    await view.click(
      within(modelsNav).getByRole("link", { name: "TinySwallow-1.5B" }),
    );
    expect(
      await screen.findByRole("heading", { name: "TinySwallow-1.5B" }),
    ).toBeInTheDocument();
    expect(
      within(modelsNav).getByRole("link", { name: "TinySwallow-1.5B" }),
    ).toHaveClass("is-active");
    expect(within(modelsNav).getByRole("link", { name: "Models" })).toHaveClass(
      "is-ancestor",
    );
  });

  it("opens Browser (WebLLM) under Inference", async () => {
    const view = userEvent.setup();
    renderDocs("/docs/inference");

    expect(screen.getByRole("heading", { name: "Inference" })).toBeInTheDocument();
    const docsNav = screen.getByRole("navigation", { name: "Documentation" });
    expect(within(docsNav).getByRole("link", { name: "Inference" })).toHaveClass(
      "is-active",
    );
    await view.click(
      within(docsNav).getByRole("link", { name: "Browser (WebLLM)" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Browser (WebLLM)" }),
    ).toBeInTheDocument();
    expect(
      within(docsNav).getByRole("link", { name: "Browser (WebLLM)" }),
    ).toHaveClass("is-active");
    expect(within(docsNav).getByRole("link", { name: "Inference" })).toHaveClass(
      "is-ancestor",
    );
  });

  it("opens TAID under Research", async () => {
    const view = userEvent.setup();
    renderDocs("/docs/research");

    expect(screen.getByRole("heading", { name: "Research" })).toBeInTheDocument();
    const docsNav = screen.getByRole("navigation", { name: "Documentation" });
    expect(within(docsNav).getByRole("link", { name: "Research" })).toHaveClass(
      "is-active",
    );
    await view.click(within(docsNav).getByRole("link", { name: "TAID" }));
    expect(await screen.findByRole("heading", { name: "TAID" })).toBeInTheDocument();
    expect(within(docsNav).getByRole("link", { name: "TAID" })).toHaveClass(
      "is-active",
    );
    expect(within(docsNav).getByRole("link", { name: "Research" })).toHaveClass(
      "is-ancestor",
    );
    expect(
      screen.getByRole("img", {
        name: "Standard knowledge distillation compared with TAID",
      }),
    ).toBeInTheDocument();
  });

  it("navigates between wiki pages from the sidebar", async () => {
    const view = userEvent.setup();
    renderDocs("/docs/overview");

    const docsNav = screen.getByRole("navigation", { name: "Documentation" });
    await view.click(within(docsNav).getByRole("link", { name: inference.title }));
    expect(
      await within(docsNav).findByRole("link", { name: inference.title }),
    ).toHaveClass("is-active");
  });

  it("shows previous and next page links at the bottom", async () => {
    const view = userEvent.setup();
    renderDocs("/docs/models");

    const pager = screen.getByRole("navigation", { name: "Page navigation" });
    expect(within(pager).getByText("Previous")).toBeInTheDocument();
    expect(within(pager).getByText("Next")).toBeInTheDocument();
    expect(
      within(pager).getByRole("link", { name: /Overview/ }),
    ).toBeInTheDocument();
    expect(
      within(pager).getByRole("link", { name: /TinySwallow-1.5B/ }),
    ).toBeInTheDocument();

    await view.click(
      within(pager).getByRole("link", { name: /Overview/ }),
    );
    expect(
      await screen.findByRole("heading", { name: overview.title }),
    ).toBeInTheDocument();

    const overviewPager = screen.getByRole("navigation", {
      name: "Page navigation",
    });
    await view.click(
      within(overviewPager).getByRole("link", { name: /Models/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "Models" }),
    ).toBeInTheDocument();
  });

  it("scrolls to the heading when a docs deep link is opened", () => {
    const headingId = inference.headings.find((heading) => heading.depth > 1)?.id;
    expect(headingId).toBeTruthy();

    const target = document.createElement("div");
    target.id = headingId!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);

    renderDocs(`/docs/inference/${headingId}`);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    target.remove();
  });

  it("renders a 404 for unknown wiki pages", () => {
    renderDocs("/docs/missing");
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("redirects the docs index to the first wiki page", async () => {
    render(
      <MemoryRouter initialEntries={["/docs"]}>
        <Routes>
          <Route path="/docs" element={<Documentation />} />
          <Route path="/docs/:pageId" element={<Documentation />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Documentation" })).toBeInTheDocument();
  });
});
