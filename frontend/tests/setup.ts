import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "en";
  document.title = "AI Code Review";
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(public readonly callback: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  configurable: true,
  writable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

for (const attributes of [
  { name: "description" },
  { property: "og:title" },
  { property: "og:description" },
  { property: "og:image" },
  { property: "og:url" },
  { property: "og:locale" },
  { name: "twitter:title" },
  { name: "twitter:description" },
  { name: "twitter:image" },
]) {
  const meta = document.createElement("meta");
  for (const [key, value] of Object.entries(attributes)) {
    meta.setAttribute(key, value);
  }
  document.head.append(meta);
}
