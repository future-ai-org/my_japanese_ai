import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { CreateWebWorkerMLCEngine } = vi.hoisted(() => ({
  CreateWebWorkerMLCEngine: vi.fn(),
}));

vi.mock("@mlc-ai/web-llm", () => ({
  CreateWebWorkerMLCEngine,
  modelLibURLPrefix: "https://models.example/",
  modelVersion: "v0",
}));

const VALID_REVIEW = {
  translation: "よろしくお願いします。",
  lesson: "Use a polite closing.",
};

function mockEngine(content: string | null, runtimeStats = "prefill: 1 tok/s") {
  return {
    chat: {
      completions: {
        create: vi.fn(async (request: { stream?: boolean }) => {
          if (request.stream) {
            return (async function* () {
              if (content) {
                yield {
                  choices: [{ delta: { content }, finish_reason: "stop" }],
                  usage: { total_tokens: 12 },
                };
              } else {
                yield {
                  choices: [{ delta: {}, finish_reason: "stop" }],
                };
              }
            })();
          }
          return {
            choices: [
              {
                finish_reason: "stop",
                message: { content },
              },
            ],
            usage: { total_tokens: 12 },
          };
        }),
      },
    },
    resetChat: vi.fn().mockResolvedValue(undefined),
    runtimeStatsText: vi.fn().mockResolvedValue(runtimeStats),
  };
}

describe("reviewCode", () => {
  beforeEach(() => {
    vi.resetModules();
    CreateWebWorkerMLCEngine.mockReset();
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: { error?: unknown; message: string }) => void) | null =
          null;
        terminate() {}
        postMessage() {
          queueMicrotask(() => {
            this.onmessage?.({
              data: { type: "done", status: "fetched" },
            } as MessageEvent);
          });
        }
      },
    );
    vi.stubGlobal("navigator", {
      gpu: {},
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loadReviewCode() {
    const { reviewCode } = await import("../src/services/review");
    return reviewCode;
  }

  it("runs a local review through WebLLM and normalizes the result", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const logs: Array<{ stage: string; message: string }> = [];

    const result = await reviewCode(
      {
        language: "polite",
        code: "print('ok')",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(result.translation).toBe("よろしくお願いします。");
    expect(result.inference?.provider).toBe("browser");
    expect(result.inference?.rawOutput).toBe(JSON.stringify(VALID_REVIEW));
    expect(engine.resetChat).toHaveBeenCalledTimes(2);
    expect(engine.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        max_tokens: 256,
        stream: true,
        response_format: {
          type: "json_object",
          schema: expect.stringContaining('"translation"'),
        },
      }),
    );
    const format = engine.chat.completions.create.mock.calls[0][0]
      .response_format as { schema: string };
    expect(JSON.parse(format.schema).required).toEqual([
      "translation",
      "lesson",
    ]);
    expect(
      Object.keys(JSON.parse(format.schema).properties),
    ).toEqual(["translation", "lesson"]);
    const request = engine.chat.completions.create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages[1]?.content).toContain("exactly three short English paragraphs");
    expect(request.messages[1]?.content).toContain(
      "keys in this order: translation, lesson",
    );
    expect(request.messages[1]?.content).toContain(
      "separated by the marker |||",
    );
    expect(request.messages[1]?.content).not.toContain(
      "exactly three English teaching paragraphs",
    );
    expect(logs.some((entry) => entry.stage === "storage")).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("Prefilling the prompt on WebGPU"),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("First token received from the local model"),
      ),
    ).toBe(true);
    expect(logs.some((entry) => entry.message.includes("validated"))).toBe(true);
  });

  it("rejects reviews when WebGPU is unavailable", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow(/WebGPU is unavailable[\s\S]*webgpureport\.org/);
  });

  it("rejects reviews when the GPU object is present but empty", async () => {
    vi.stubGlobal("navigator", {
      gpu: undefined,
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow(/WebGPU is unavailable/);
  });

  it("rejects oversized local submissions before loading the model", async () => {
    const reviewCode = await loadReviewCode();
    await expect(
      reviewCode({
        language: "polite",
        code: "x".repeat(4001),
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow(/code characters/);
    expect(CreateWebWorkerMLCEngine).not.toHaveBeenCalled();
  });

  it("rejects when the browser reports too little site storage", async () => {
    vi.stubGlobal("navigator", {
      gpu: {},
      storage: {
        persist: async () => false,
        estimate: async () => ({ usage: 800 * 1024 * 1024, quota: 900 * 1024 * 1024 }),
      },
    });
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow(/available site storage/);
  });

  it("rejects empty model output", async () => {
    CreateWebWorkerMLCEngine.mockResolvedValue(mockEngine(null));
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow("TinySwallow did not return a review.");
  });

  it("continues when optional runtime statistics are unavailable", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.runtimeStatsText.mockRejectedValue(new Error("stats unavailable"));
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    const result = await reviewCode({
      language: "casual",
      code: "const value = 1;",
      parameters: { temperature: 0.1, maxTokens: 128 },
    });

    expect(result.inference?.runtimeStats).toBeUndefined();
    expect(result.translation).toBe("よろしくお願いします。");
  });

  it("reports model-load progress", async () => {
    const engine = mockEngine(
      JSON.stringify({
        ...VALID_REVIEW,
      }),
    );
    CreateWebWorkerMLCEngine.mockImplementation(
      async (_worker, _modelId, options) => {
        options?.initProgressCallback?.({
          progress: 0.4,
          text: "Downloading weights",
          timeElapsed: 1.2,
        });
        options?.initProgressCallback?.({
          progress: 0,
          text: "Loading model from cache[29/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
          timeElapsed: 1.3,
        });
        options?.initProgressCallback?.({
          progress: 0,
          text: "Loading model from cache[30/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
          timeElapsed: 1.3,
        });
        options?.initProgressCallback?.({
          progress: 0,
          text: "Loading model from cache[30/30]: 0MB loaded. 0% completed, 0 secs elapsed.",
          timeElapsed: 1.3,
        });
        return engine;
      },
    );
    const reviewCode = await loadReviewCode();
    const progress: Array<{ progress: number; text: string }> = [];
    const logs: Array<{ stage: string; message: string }> = [];

    await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (entry) => progress.push(entry),
      (entry) => logs.push(entry),
    );

    expect(progress.some((entry) => entry.text === "Checking browser storage…")).toBe(
      true,
    );
    expect(progress.some((entry) => entry.text === "Downloading weights")).toBe(
      true,
    );
    expect(
      progress.some(
        (entry) =>
          entry.text === "Downloading weights" && entry.elapsedSeconds === 1.2,
      ),
    ).toBe(true);
    expect(
      progress.filter((entry) => entry.text.includes("from cache")).length,
    ).toBe(3);
    expect(
      progress.some(
        (entry) =>
          entry.text.includes("from cache[29/30]") &&
          Math.abs(entry.progress - 29 / 30) < 1e-9,
      ),
    ).toBe(true);
    expect(
      progress.some(
        (entry) =>
          entry.text.includes("from cache[30/30]") && entry.progress === 1,
      ),
    ).toBe(true);
    expect(
      logs.filter(
        (entry) =>
          entry.stage === "model-load" && entry.message.includes("from cache"),
      ),
    ).toHaveLength(0);
  });

  it("warns when browser storage diagnostics are unavailable", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const logs: Array<{ level: string; stage: string }> = [];

    await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(
      logs.some(
        (entry) =>
          entry.stage === "storage" && entry.level === "warning",
      ),
    ).toBe(true);
  });

  it("continues when persist() fails and storage estimates are missing", async () => {
    vi.stubGlobal("navigator", {
      gpu: {},
      storage: {
        persist: async () => {
          throw new Error("denied");
        },
        estimate: async () => ({}),
      },
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。" });
  });

  it("resets the cached engine when WebLLM initialization fails", async () => {
    CreateWebWorkerMLCEngine.mockRejectedValueOnce(new Error("init failed"));
    const reviewCode = await loadReviewCode();
    const request = {
      language: "polite" as const,
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    };

    await expect(reviewCode(request)).rejects.toThrow("init failed");

    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    await expect(reviewCode(request)).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it("fails initialization when the WebLLM worker crashes", async () => {
    CreateWebWorkerMLCEngine.mockImplementation(
      async (worker: {
        onerror: ((event: { error?: unknown; message: string }) => void) | null;
      }) => {
        queueMicrotask(() => {
          worker.onerror?.({
            error: new Error("worker died"),
            message: "worker died",
          });
        });
        return new Promise(() => {});
      },
    );
    const reviewCode = await loadReviewCode();
    const request = {
      language: "polite" as const,
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    };

    await expect(reviewCode(request)).rejects.toThrow("worker died");

    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    await expect(reviewCode(request)).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it("drops the cached engine if the WebLLM worker crashes after load", async () => {
    const workers: Array<{
      onerror: ((event: { error?: unknown; message: string }) => void) | null;
    }> = [];
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: { error?: unknown; message: string }) => void) | null =
          null;
        terminate() {}
        postMessage() {
          queueMicrotask(() => {
            this.onmessage?.({
              data: { type: "done", status: "fetched" },
            } as MessageEvent);
          });
        }
        constructor() {
          workers.push(this);
        }
      },
    );
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const request = {
      language: "polite" as const,
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    };

    await expect(reviewCode(request)).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledTimes(1);

    workers[0]?.onerror?.({ message: "script error" });

    await expect(reviewCode(request)).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledTimes(2);
  });

  it("wraps non-Error failures from generation", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.chat.completions.create.mockRejectedValue({ message: "gpu lost" });
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow("gpu lost");
  });

  it("wraps primitive generation failures", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.chat.completions.create.mockRejectedValue("offline");
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow("offline");
  });

  it("uses a generic message when the thrown value has no message", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.chat.completions.create.mockRejectedValue({ message: 500 });
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow("Unknown review failure.");
  });

  it("records a null finish reason when WebLLM omits one", async () => {
    const engine = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(VALID_REVIEW) } }],
            usage: { total_tokens: 9 },
          }),
        },
      },
      resetChat: vi.fn().mockResolvedValue(undefined),
      runtimeStatsText: vi.fn().mockResolvedValue("ok"),
    };
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    const result = await reviewCode({
      language: "polite",
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    });
    expect(result.inference?.finishReason).toBeNull();
  });

  it("still returns a review when clearing the generation cache fails", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.resetChat
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("busy"));
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const logs: Array<{ level: string; message: string }> = [];

    const result = await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(result.translation).toBe("よろしくお願いします。");
    await vi.waitFor(() => {
      expect(
        logs.some((entry) =>
          entry.message.includes("Could not clear the generation cache"),
        ),
      ).toBe(true);
    });
  });

  it("runs without resetChat when the engine does not expose it", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    delete (engine as { resetChat?: unknown }).resetChat;
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。" });
  });

  it("preloads the engine once and reuses it for the first review", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const { preloadBrowserModel, reviewCode } = await import(
      "../src/services/review"
    );

    await preloadBrowserModel();
    await reviewCode({
      language: "polite",
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    });

    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledTimes(1);
  });

  it("requests a high-performance adapter and still runs on software GPUs", async () => {
    const requestAdapter = vi.fn().mockResolvedValue({
      isFallbackAdapter: true,
      info: { vendor: "Google", description: "SwiftShader" },
    });
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter },
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const { reviewCode, SOFTWARE_GPU_MESSAGE } = await import(
      "../src/services/review"
    );
    const logs: Array<{ level: string; message: string }> = [];

    await expect(
      reviewCode(
        {
          language: "polite",
          code: "pass",
          parameters: { temperature: 0.2, maxTokens: 256 },
        },
        undefined,
        (entry) => logs.push(entry),
      ),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(requestAdapter).toHaveBeenCalledWith({
      powerPreference: "high-performance",
    });
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalled();
    expect(
      logs.some(
        (entry) =>
          entry.level === "warning" && entry.message === SOFTWARE_GPU_MESSAGE,
      ),
    ).toBe(true);
  });

  it("rejects when WebGPU cannot find an adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: async () => null },
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow(/Unable to find a compatible GPU/);
  });

  it("logs a hardware adapter and continues initialization", async () => {
    const requestAdapterInfo = vi.fn().mockResolvedValue({
      vendor: "nvidia",
      device: "rtx",
    });
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: async () => ({
          isFallbackAdapter: false,
          requestAdapterInfo,
          limits: { maxStorageBufferBindingSize: 1024 },
        }),
      },
      storage: {
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const logs: Array<{ stage: string }> = [];

    await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(requestAdapterInfo).toHaveBeenCalled();
    expect(logs.some((entry) => entry.stage === "gpu")).toBe(true);
    expect(CreateWebWorkerMLCEngine).toHaveBeenCalled();
  });

  it("rejects invalid JSON from the model", async () => {
    CreateWebWorkerMLCEngine.mockResolvedValue(mockEngine("{not json"));
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).rejects.toThrow("TinySwallow returned invalid JSON.");
  });

  it("accepts markdown-fenced JSON from TinySwallow", async () => {
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(`\`\`\`json\n${JSON.stringify(VALID_REVIEW)}\n\`\`\``),
    );
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。", lesson: "Use a polite closing." });
  });

  it("recovers a truncated TinySwallow JSON review", async () => {
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(
        '{"translation":"よろしくお願いします。","lesson":"Use a polite closing."',
      ),
    );
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。", lesson: "Use a polite closing." });
  });

  it("stringifies non-string WebLLM chunks before parsing", async () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const engine = mockEngine(null);
    engine.chat.completions.create.mockImplementation(async () => {
      return (async function* () {
        yield { choices: [{ delta: { content: circular } }] };
        yield { choices: [{ delta: { content: 80 } }] };
        yield {
          choices: [
            { delta: { content: VALID_REVIEW }, finish_reason: "stop" },
          ],
        };
      })();
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    await expect(
      reviewCode({
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      }),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。", lesson: "Use a polite closing." });
  });

  it("aggregates streamed tokens and surfaces them as progress", async () => {
    const engine = mockEngine(JSON.stringify(VALID_REVIEW));
    engine.chat.completions.create.mockImplementation(async () => {
      return (async function* () {
        yield { choices: [{ delta: { content: '{"translation":' } }] };
        yield {
          choices: [
            {
              delta: { content: '"よろしくお願いします。","lesson":"Use a polite closing."}' },
              finish_reason: "stop",
            },
          ],
          usage: { total_tokens: 8 },
        };
      })();
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const progress: Array<{ text: string; streamedText?: string }> = [];

    const result = await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (entry) => progress.push(entry),
    );

    expect(result.translation).toBe("よろしくお願いします。");
    expect(
      progress.some((entry) => entry.streamedText?.includes('{"translation":')),
    ).toBe(true);
    expect(
      progress.some((entry) => entry.result?.partial && entry.result.translation === "よろしくお願いします。"),
    ).toBe(true);
    expect(
      progress.some(
        (entry) => entry.result?.translation === "よろしくお願いします。" && !entry.result.partial,
      ),
    ).toBe(true);
    expect(
      progress.some((entry) =>
        entry.streamedText?.includes('"lesson":"Use a polite closing."'),
      ),
    ).toBe(false);
  });

  it("checks persistent storage only once per session", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      gpu: {},
      storage: {
        persist,
        estimate: async () => ({ usage: 0, quota: 2 * 1024 * 1024 * 1024 }),
      },
    });
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const request = {
      language: "polite" as const,
      code: "pass",
      parameters: { temperature: 0.2, maxTokens: 256 },
    };

    await reviewCode(request);
    await reviewCode(request);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("forwards artifact prefetch progress and continues when shards are already cached", async () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        terminate = vi.fn();
        postMessage() {
          queueMicrotask(() => {
            this.onmessage?.({ data: undefined } as MessageEvent);
            this.onmessage?.({
              data: { type: "progress", progress: 0.4, text: "shard 1" },
            } as MessageEvent);
            this.onmessage?.({
              data: { type: "done", status: "cached" },
            } as MessageEvent);
          });
        }
      },
    );
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const progress: Array<{ text: string }> = [];
    const logs: Array<{ message: string }> = [];

    await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (entry) => progress.push(entry),
      (entry) => logs.push(entry),
    );

    expect(progress.some((entry) => entry.text === "shard 1")).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("artifacts were already cached"),
      ),
    ).toBe(true);
  });

  it("starts WebLLM after a worker finishes fetching missing shards", async () => {
    vi.stubGlobal("indexedDB", {});
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const logs: Array<{ message: string }> = [];

    await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(
      logs.some((entry) =>
        entry.message.includes("artifacts cached; starting WebLLM"),
      ),
    ).toBe(true);
  });

  it("logs a warning and still reviews when artifact prefetch fails", async () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: { error?: unknown; message: string }) => void) | null =
          null;
        terminate = vi.fn();
        postMessage() {
          queueMicrotask(() => {
            this.onmessage?.({
              data: { type: "error", message: "quota exceeded" },
            } as MessageEvent);
          });
        }
      },
    );
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const logs: Array<{ level: string; message: string }> = [];

    await expect(
      reviewCode(
        {
          language: "polite",
          code: "pass",
          parameters: { temperature: 0.2, maxTokens: 256 },
        },
        undefined,
        (entry) => logs.push(entry),
      ),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(
      logs.some(
        (entry) =>
          entry.level === "warning" &&
          entry.message.includes("Parallel artifact prefetch failed"),
      ),
    ).toBe(true);
  });

  it("treats a prefetch worker crash as a non-fatal failure", async () => {
    vi.stubGlobal("indexedDB", {});
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: { error?: unknown; message: string }) => void) | null =
          null;
        terminate = vi.fn();
        postMessage() {
          queueMicrotask(() => {
            this.onerror?.({
              error: new Error("worker crashed"),
              message: "script error",
            });
          });
        }
      },
    );
    CreateWebWorkerMLCEngine.mockResolvedValue(
      mockEngine(JSON.stringify(VALID_REVIEW)),
    );
    const reviewCode = await loadReviewCode();
    const logs: Array<{ level: string; message: string }> = [];

    await expect(
      reviewCode(
        {
          language: "polite",
          code: "pass",
          parameters: { temperature: 0.2, maxTokens: 256 },
        },
        undefined,
        (entry) => logs.push(entry),
      ),
    ).resolves.toMatchObject({ translation: "よろしくお願いします。" });
    expect(
      logs.some((entry) =>
        entry.message.includes("Parallel artifact prefetch failed"),
      ),
    ).toBe(true);
  });

  it("keeps generated tokens when the user cancels mid-stream", async () => {
    const controller = new AbortController();
    const interruptGenerate = vi.fn();
    const engine = {
      ...mockEngine('{"translation":'),
      interruptGenerate,
      chat: {
        completions: {
          create: vi.fn(async () => {
            return (async function* () {
              yield {
                choices: [{ delta: { content: '{"translation":' } }],
              };
              await new Promise(() => {});
            })();
          }),
        },
      },
    };
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const { ReviewInterruptedError } = await import("../src/review/resume");

    const pending = reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (progress) => {
        if (progress.streamedText) controller.abort();
      },
      undefined,
      controller.signal,
    );

    await expect(pending).rejects.toBeInstanceOf(ReviewInterruptedError);
    await expect(pending).rejects.toMatchObject({
      streamedText: '{"translation":',
    });
    expect(interruptGenerate).toHaveBeenCalled();
  });

  it("finishes a review if generation was interrupted after valid JSON", async () => {
    const controller = new AbortController();
    const payload = JSON.stringify(VALID_REVIEW);
    const engine = {
      ...mockEngine(payload),
      interruptGenerate: vi.fn(),
      chat: {
        completions: {
          create: vi.fn(async () => {
            return (async function* () {
              yield {
                choices: [{ delta: { content: payload }, finish_reason: "stop" }],
              };
              await new Promise(() => {});
            })();
          }),
        },
      },
    };
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();

    const pending = reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (progress) => {
        if (progress.result && !progress.result.partial) return;
        if (progress.streamedText || progress.result) controller.abort();
      },
      undefined,
      controller.signal,
    );

    await expect(pending).resolves.toMatchObject({ translation: "よろしくお願いします。" });
  });

  it("aborts before the first token without a resume checkpoint", async () => {
    const controller = new AbortController();
    const interruptGenerate = vi.fn(() => {
      throw new Error("busy");
    });
    const engine = {
      ...mockEngine(JSON.stringify(VALID_REVIEW)),
      interruptGenerate,
      chat: {
        completions: {
          create: vi.fn(() => new Promise(() => {})),
        },
      },
    };
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const { isReviewInterruptedError } = await import("../src/review/resume");
    const { isAbortError } = await import("../src/review/abort");

    const pending = reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
      },
      (progress) => {
        if (progress.text.includes("Prefilling")) controller.abort();
      },
      undefined,
      controller.signal,
    );

    await expect(pending).rejects.toSatisfy(
      (error) => isAbortError(error) && !isReviewInterruptedError(error),
    );
    expect(interruptGenerate).toHaveBeenCalled();
  });

  it("resumes an interrupted review from the stored prefix", async () => {
    const raw = JSON.stringify(VALID_REVIEW);
    const prefix = raw.slice(0, 28);
    const rest = raw.slice(28);
    const engine = mockEngine(rest);
    CreateWebWorkerMLCEngine.mockResolvedValue(engine);
    const reviewCode = await loadReviewCode();
    const logs: Array<{ message: string }> = [];

    const result = await reviewCode(
      {
        language: "polite",
        code: "pass",
        parameters: { temperature: 0.2, maxTokens: 256 },
        resumeFrom: prefix,
        resumeElapsedMs: 500,
      },
      undefined,
      (entry) => logs.push(entry),
    );

    expect(result.translation).toBe("よろしくお願いします。");
    expect(result.durationMs).toBeGreaterThanOrEqual(500);
    expect(result.inference?.rawOutput).toBe(raw);
    expect(
      logs.some((entry) =>
        entry.message.includes("Resuming the interrupted local review."),
      ),
    ).toBe(true);
    const request = engine.chat.completions.create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      response_format?: { type: string };
    };
    expect(request.response_format).toBeUndefined();
    expect(request.messages).toHaveLength(3);
    expect(request.messages[2]?.content).toContain("PREFIX:");
    expect(request.messages[2]?.content).toContain(prefix);
  });
});

