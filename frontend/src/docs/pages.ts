import browserWebllm from "../../../documentation/browser-webllm.md?raw";
import huggingfaceInference from "../../../documentation/huggingface-inference.md?raw";
import inference from "../../../documentation/inference.md?raw";
import models from "../../../documentation/models.md?raw";
import modalVllm from "../../../documentation/modal-vllm.md?raw";
import overview from "../../../documentation/overview.md?raw";
import research from "../../../documentation/research.md?raw";
import taid from "../../../documentation/taid.md?raw";
import tinyswallow from "../../../documentation/tinyswallow.md?raw";

export interface DocHeading {
  depth: 1 | 2 | 3;
  text: string;
  id: string;
}

export interface DocPage {
  id: string;
  title: string;
  source: string;
  headings: DocHeading[];
  parentId?: string;
}

export interface DocNavEntry {
  page: DocPage;
  children: DocPage[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/[`*_]/g, "").trim();
    headings.push({
      depth: match[1].length as 1 | 2 | 3,
      text,
      id: slugify(text),
    });
  }

  return headings;
}

function titleFromSource(source: string, fallback: string): string {
  return extractHeadings(source).find((heading) => heading.depth === 1)?.text ?? fallback;
}

function createPage(
  id: string,
  fallbackTitle: string,
  source: string,
  parentId?: string,
): DocPage {
  return {
    id,
    title: titleFromSource(source, fallbackTitle),
    source,
    headings: extractHeadings(source),
    parentId,
  };
}

export const DOC_PAGES: DocPage[] = [
  createPage("overview", "Overview", overview),
  createPage("models", "Models", models),
  createPage("tinyswallow", "TinySwallow-1.5B", tinyswallow, "models"),
  createPage("inference", "Inference", inference),
  createPage("browser-webllm", "Browser (WebLLM)", browserWebllm, "inference"),
  createPage("modal-vllm", "Modal (dedicated vLLM)", modalVllm, "inference"),
  createPage(
    "huggingface-inference",
    "Hugging Face (Inference Provider)",
    huggingfaceInference,
    "inference",
  ),
  createPage("research", "Research", research),
  createPage("taid", "TAID", taid, "research"),
];

export function docNavTree(pages: DocPage[] = DOC_PAGES): DocNavEntry[] {
  const childrenByParent = new Map<string, DocPage[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const siblings = childrenByParent.get(page.parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parentId, siblings);
  }

  return pages
    .filter((page) => !page.parentId)
    .map((page) => ({
      page,
      children: childrenByParent.get(page.id) ?? [],
    }));
}

export function getDocPage(id: string | undefined): DocPage | undefined {
  return DOC_PAGES.find((page) => page.id === id);
}

export function getAdjacentDocPages(id: string): {
  previous: DocPage | null;
  next: DocPage | null;
} {
  const index = DOC_PAGES.findIndex((page) => page.id === id);
  if (index < 0) {
    return { previous: null, next: null };
  }
  return {
    previous: index > 0 ? DOC_PAGES[index - 1] : null,
    next: index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null,
  };
}

export function findDocPage(id: string): DocPage {
  return getDocPage(id) ?? DOC_PAGES[0];
}

export function docHash(pageId: string, headingId: string | null = null): string {
  return headingId ? `#docs/${pageId}/${headingId}` : `#docs/${pageId}`;
}

export function parseDocHash(hash: string): { pageId: string; headingId: string | null } {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  const tokens = parts[0] === "docs" ? parts.slice(1) : parts;
  const page = DOC_PAGES.find((candidate) => candidate.id === tokens[0]);
  return {
    pageId: page?.id ?? DOC_PAGES[0].id,
    headingId: tokens[1] || null,
  };
}

export function parseDocHref(href: string | undefined): {
  pageId: string;
  headingId: string | null;
} | null {
  if (!href) return null;

  const match = /^(?:\.\/)?([\w-]+)\.md(?:#(.+))?$/.exec(href);
  if (!match) return null;

  const page = DOC_PAGES.find((candidate) => candidate.id === match[1]);
  if (!page) return null;

  return { pageId: page.id, headingId: match[2] ? slugify(match[2]) : null };
}
