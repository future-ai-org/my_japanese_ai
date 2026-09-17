import { beforeEach, describe, expect, it, vi } from "vitest";

const onmessage = vi.fn();

vi.mock("@mlc-ai/web-llm", () => ({
  WebWorkerMLCEngineHandler: class {
    onmessage = onmessage;
  },
}));

describe("webllm worker", () => {
  beforeEach(() => {
    vi.resetModules();
    onmessage.mockClear();
  });

  it("forwards worker messages to the WebLLM handler", async () => {
    await import("../src/workers/webllm");
    const event = new MessageEvent("message", { data: { kind: "init" } });
    self.onmessage?.(event);
    expect(onmessage).toHaveBeenCalledWith(event);
  });
});
