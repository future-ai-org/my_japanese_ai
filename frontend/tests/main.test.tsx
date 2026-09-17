import { beforeEach, describe, expect, it, vi } from "vitest";

const renderApp = vi.fn();
const createRoot = vi.fn(() => ({ render: renderApp }));

vi.mock("react-dom/client", () => ({
  createRoot,
}));

vi.mock("../src/App", () => ({
  default: () => null,
}));

describe("main", () => {
  beforeEach(() => {
    vi.resetModules();
    createRoot.mockClear();
    renderApp.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("mounts the React application into #root", async () => {
    await import("../src/main");
    expect(createRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderApp).toHaveBeenCalled();
  });
});
