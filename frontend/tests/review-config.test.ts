import { afterEach, describe, expect, it, vi } from "vitest";

describe("REVIEW_CONFIG", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses conservative local-model defaults", async () => {
    vi.stubEnv("VITE_REVIEW_MAX_TOKENS", "");
    vi.stubEnv("VITE_REVIEW_MAX_TOKENS_LIMIT", "");
    vi.stubEnv("VITE_WEBLLM_DOWNLOAD_CONCURRENCY", "");
    vi.resetModules();
    const { REVIEW_CONFIG, WEBLLM_APP_CONFIG } = await import(
      "../src/config/review"
    );

    expect(REVIEW_CONFIG.defaultModelId).toBe(REVIEW_CONFIG.model.id);
    expect(REVIEW_CONFIG.models).toHaveLength(1);
    expect(REVIEW_CONFIG.models[0]).toBe(REVIEW_CONFIG.model);
    expect(REVIEW_CONFIG.model.id).toContain("TinySwallow");
    expect(REVIEW_CONFIG.model.label).toBe("TinySwallow-1.5B");
    expect(REVIEW_CONFIG.model.description).toBe("");
    expect(REVIEW_CONFIG.model.limits).toEqual(REVIEW_CONFIG.limits);
    expect(REVIEW_CONFIG.model.generation).toEqual(REVIEW_CONFIG.generation);
    expect(REVIEW_CONFIG.limits.maxCodeCharacters).toBe(4000);
    expect(REVIEW_CONFIG.limits.maxTokens).toBe(1024);
    expect(REVIEW_CONFIG.generation).toEqual({
      temperature: 0.2,
      maxTokens: 512,
    });
    expect(REVIEW_CONFIG.storage.cacheBackend).toBe("indexeddb");
    expect(REVIEW_CONFIG.storage.downloadConcurrency).toBe(8);
    expect(REVIEW_CONFIG.storage.downloadConcurrencyMax).toBe(16);
    expect(REVIEW_CONFIG.temperature).toEqual({ min: 0, max: 1, step: 0.1 });
    expect(REVIEW_CONFIG.tokenChoices.map((choice) => choice.value)).toEqual([
      256, 384, 512, 768, 1024,
    ]);
    expect(REVIEW_CONFIG.webgpu).toEqual({
      powerPreference: "high-performance",
      lowResourceRequired: true,
    });
    expect(REVIEW_CONFIG.artifacts.configFilename).toBe("mlc-chat-config.json");
    expect(REVIEW_CONFIG.phases).toEqual({
      browserPrefillSeconds: 1,
    });
    expect(WEBLLM_APP_CONFIG.useIndexedDBCache).toBe(true);
    expect(WEBLLM_APP_CONFIG.model_list).toHaveLength(1);
    expect(WEBLLM_APP_CONFIG.model_list[0]).toMatchObject({
      model_id: REVIEW_CONFIG.model.id,
      model: REVIEW_CONFIG.model.url,
      model_lib: REVIEW_CONFIG.model.libraryUrl,
      vram_required_MB: 1889,
      overrides: {
        context_window_size: 4096,
        prefill_chunk_size: 1024,
      },
    });
  });

  it("reads cache backend and numeric overrides from env", async () => {
    vi.stubEnv("VITE_WEBLLM_CACHE_BACKEND", "cache");
    vi.stubEnv("VITE_WEBLLM_DOWNLOAD_CONCURRENCY", "12");
    vi.stubEnv("VITE_WEBLLM_MODEL_LABEL", "Custom Swallow");
    vi.stubEnv("VITE_WEBLLM_DESCRIPTION", "Hosted privately.");
    vi.stubEnv("VITE_WEBLLM_MODEL_ID", "custom-model");
    vi.stubEnv("VITE_WEBLLM_MODEL_URL", "https://example.test/model");
    vi.stubEnv("VITE_WEBLLM_MODEL_LIBRARY_URL", "https://example.test/lib.wasm");
    vi.stubEnv("VITE_WEBLLM_MODEL_VRAM_MB", "2048");
    vi.stubEnv("VITE_WEBLLM_CONTEXT_WINDOW_SIZE", "2048");
    vi.stubEnv("VITE_WEBLLM_PREFILL_CHUNK_SIZE", "512");
    vi.stubEnv("VITE_WEBLLM_MODEL_DOWNLOAD_MB", "400");
    vi.stubEnv("VITE_REVIEW_MAX_CODE_CHARACTERS", "2000");
    vi.stubEnv("VITE_REVIEW_TEMPERATURE", "0.5");
    vi.stubEnv("VITE_REVIEW_MAX_TOKENS", "256");
    vi.stubEnv("VITE_REVIEW_MAX_TOKENS_LIMIT", "384");
    vi.stubEnv("VITE_REVIEW_TOKEN_SHORT", "128");
    vi.stubEnv("VITE_REVIEW_TEMPERATURE_MAX", "0.8");
    vi.stubEnv("VITE_BROWSER_PREFILL_PHASE_SECONDS", "2");
    vi.resetModules();

    const { REVIEW_CONFIG, WEBLLM_APP_CONFIG } = await import(
      "../src/config/review"
    );

    expect(REVIEW_CONFIG.model).toMatchObject({
      label: "Custom Swallow",
      description: "Hosted privately.",
      id: "custom-model",
      url: "https://example.test/model",
      libraryUrl: "https://example.test/lib.wasm",
      vramRequiredMB: 2048,
      contextWindowSize: 2048,
      prefillChunkSize: 512,
      downloadSizeMB: 400,
    });
    expect(REVIEW_CONFIG.generation).toEqual({
      temperature: 0.5,
      maxTokens: 256,
    });
    expect(REVIEW_CONFIG.limits).toEqual({
      maxCodeCharacters: 2000,
      maxTokens: 384,
    });
    expect(REVIEW_CONFIG.storage.cacheBackend).toBe("cache");
    expect(REVIEW_CONFIG.storage.downloadConcurrency).toBe(12);
    expect(REVIEW_CONFIG.tokenChoices[0]?.value).toBe(128);
    expect(REVIEW_CONFIG.temperature.max).toBe(0.8);
    expect(REVIEW_CONFIG.phases.browserPrefillSeconds).toBe(2);
    expect(WEBLLM_APP_CONFIG.useIndexedDBCache).toBe(false);
    expect(WEBLLM_APP_CONFIG.model_list[0]).toMatchObject({
      model_id: "custom-model",
      model: "https://example.test/model",
      model_lib: "https://example.test/lib.wasm",
    });
  });

  it("reads WebGPU and artifact overrides from env", async () => {
    vi.stubEnv("VITE_WEBLLM_POWER_PREFERENCE", "low-power");
    vi.stubEnv("VITE_WEBLLM_LOW_RESOURCE_REQUIRED", "false");
    vi.stubEnv("VITE_WEBLLM_HF_REVISION", "refs/pr/1");
    vi.stubEnv("VITE_WEBLLM_CONFIG_FILENAME", "chat-config.json");
    vi.stubEnv("VITE_WEBLLM_TOKENIZER_FILES", "tokenizer.json");
    vi.stubEnv("VITE_REVIEW_TOKEN_MEDIUM", "350");
    vi.resetModules();

    const { REVIEW_CONFIG, WEBLLM_APP_CONFIG } = await import(
      "../src/config/review"
    );
    expect(REVIEW_CONFIG.webgpu).toEqual({
      powerPreference: "low-power",
      lowResourceRequired: false,
    });
    expect(REVIEW_CONFIG.artifacts).toMatchObject({
      huggingfaceRevision: "refs/pr/1",
      configFilename: "chat-config.json",
      tokenizerFiles: ["tokenizer.json"],
    });
    expect(REVIEW_CONFIG.tokenChoices[1]?.value).toBe(350);
    expect(WEBLLM_APP_CONFIG.model_list[0]?.low_resource_required).toBe(false);
  });

  it("treats invalid boolean and power preference overrides as defaults", async () => {
    vi.stubEnv("VITE_WEBLLM_POWER_PREFERENCE", "balanced");
    vi.stubEnv("VITE_WEBLLM_LOW_RESOURCE_REQUIRED", "maybe");
    vi.stubEnv("VITE_WEBLLM_TOKENIZER_FILES", "  ,  ");
    vi.resetModules();

    const { REVIEW_CONFIG } = await import("../src/config/review");
    expect(REVIEW_CONFIG.webgpu.powerPreference).toBe("high-performance");
    expect(REVIEW_CONFIG.webgpu.lowResourceRequired).toBe(true);
    expect(REVIEW_CONFIG.artifacts.tokenizerFiles).toEqual([
      "tokenizer.json",
      "tokenizer.model",
    ]);
  });

  it("accepts truthy low-resource flags from env", async () => {
    vi.stubEnv("VITE_WEBLLM_LOW_RESOURCE_REQUIRED", "yes");
    vi.resetModules();
    const { REVIEW_CONFIG } = await import("../src/config/review");
    expect(REVIEW_CONFIG.webgpu.lowResourceRequired).toBe(true);
  });

  it("ignores invalid numeric environment values", async () => {
    vi.stubEnv("VITE_REVIEW_MAX_TOKENS", "nope");
    vi.stubEnv("VITE_WEBLLM_MODEL_VRAM_MB", "0");
    vi.resetModules();

    const { REVIEW_CONFIG } = await import("../src/config/review");
    expect(REVIEW_CONFIG.generation.maxTokens).toBe(512);
    expect(REVIEW_CONFIG.model.vramRequiredMB).toBe(1889);
  });

  it("caps temperature at 1 even when env asks for more", async () => {
    vi.stubEnv("VITE_REVIEW_TEMPERATURE_MAX", "2");
    vi.stubEnv("VITE_REVIEW_TEMPERATURE", "1.5");
    vi.resetModules();

    const { REVIEW_CONFIG } = await import("../src/config/review");
    expect(REVIEW_CONFIG.temperature.max).toBe(1);
    expect(REVIEW_CONFIG.generation.temperature).toBe(1);
  });

  it("resolves catalog models and applies their generation defaults", async () => {
    const {
      REVIEW_CONFIG,
      parametersForModel,
      reviewModelForRuntimeId,
    } = await import("../src/config/review");

    expect(reviewModelForRuntimeId("missing-model")).toBeUndefined();
    expect(reviewModelForRuntimeId(undefined)).toBeUndefined();
    expect(reviewModelForRuntimeId(REVIEW_CONFIG.model.id)?.id).toBe(
      REVIEW_CONFIG.model.id,
    );
    expect(
      reviewModelForRuntimeId(`runtime/${REVIEW_CONFIG.model.id}`)?.id,
    ).toBe(REVIEW_CONFIG.model.id);
    expect(
      reviewModelForRuntimeId("SakanaAI/TinySwallow-1.5B-Instruct")?.label,
    ).toBe("TinySwallow-1.5B");
    expect(parametersForModel(REVIEW_CONFIG.model)).toEqual({
      temperature: REVIEW_CONFIG.generation.temperature,
      maxTokens: REVIEW_CONFIG.generation.maxTokens,
    });
  });
});
