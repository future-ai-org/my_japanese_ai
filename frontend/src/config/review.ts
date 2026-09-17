import {
  modelLibURLPrefix,
  modelVersion,
  type AppConfig,
} from "@mlc-ai/web-llm";
import { type ReviewParameters } from "../types/review";
import { numberFromEnv, stringFromEnv } from "./env";

export {
  createReviewPrompt,
  REVIEW_SYSTEM_PROMPT,
  WEBLLM_REVIEW_SCHEMA,
  WEBLLM_REVIEW_SCHEMA_JSON,
} from "../shared/review";

type TokenLabelKey =
  | "token.short"
  | "token.medium"
  | "token.standard"
  | "token.long"
  | "token.extended";

interface TokenChoice {
  value: number;
  labelKey: TokenLabelKey;
}

function cacheBackendFromEnv(
  value: string | undefined,
): "cache" | "indexeddb" {
  return value === "cache" ? value : "indexeddb";
}

function powerPreferenceFromEnv(
  value: string | undefined,
): "high-performance" | "low-power" {
  return value === "low-power" ? value : "high-performance";
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const defaultModelLibrary =
  `${modelLibURLPrefix}${modelVersion}/` +
  "Qwen2-1.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm";

const defaultDownloadConcurrency = numberFromEnv(
  import.meta.env.VITE_WEBLLM_DOWNLOAD_CONCURRENCY,
  8,
  1,
);
const downloadConcurrencyMax = numberFromEnv(
  import.meta.env.VITE_WEBLLM_DOWNLOAD_CONCURRENCY_MAX,
  16,
  1,
);
const TEMPERATURE_LIMIT = numberFromEnv(
  import.meta.env.VITE_REVIEW_TEMPERATURE_LIMIT,
  1,
  0,
);
const temperatureMin = Math.min(
  numberFromEnv(import.meta.env.VITE_REVIEW_TEMPERATURE_MIN, 0, 0),
  TEMPERATURE_LIMIT,
);
const temperatureMax = Math.max(
  temperatureMin,
  Math.min(
    numberFromEnv(
      import.meta.env.VITE_REVIEW_TEMPERATURE_MAX,
      TEMPERATURE_LIMIT,
      0,
    ),
    TEMPERATURE_LIMIT,
  ),
);
const defaultTemperature = Math.min(
  temperatureMax,
  Math.max(
    temperatureMin,
    numberFromEnv(import.meta.env.VITE_REVIEW_TEMPERATURE, 0.2, 0),
  ),
);
const tokenMedium = numberFromEnv(
  import.meta.env.VITE_REVIEW_TOKEN_MEDIUM,
  384,
  1,
);
const tokenizerFiles = stringFromEnv(
  import.meta.env.VITE_WEBLLM_TOKENIZER_FILES,
  "tokenizer.json,tokenizer.model",
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const tinySwallowModel = {
  id: stringFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_ID,
    "TinySwallow-1.5B-Instruct-q4f32_1-MLC",
  ),
  label: stringFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_LABEL,
    "TinySwallow-1.5B",
  ),
  description: stringFromEnv(
    import.meta.env.VITE_WEBLLM_DESCRIPTION,
    "",
  ),
  url: stringFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_URL,
    "https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC",
  ),
  libraryUrl: stringFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_LIBRARY_URL,
    defaultModelLibrary,
  ),
  vramRequiredMB: numberFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_VRAM_MB,
    1889,
    1,
  ),
  contextWindowSize: numberFromEnv(
    import.meta.env.VITE_WEBLLM_CONTEXT_WINDOW_SIZE,
    4096,
    256,
  ),
  prefillChunkSize: numberFromEnv(
    import.meta.env.VITE_WEBLLM_PREFILL_CHUNK_SIZE,
    1024,
    1,
  ),
  downloadSizeMB: numberFromEnv(
    import.meta.env.VITE_WEBLLM_MODEL_DOWNLOAD_MB,
    870,
    1,
  ),
  limits: {
    maxCodeCharacters: numberFromEnv(
      import.meta.env.VITE_REVIEW_MAX_CODE_CHARACTERS,
      4_000,
      1,
    ),
    maxTokens: numberFromEnv(
      import.meta.env.VITE_REVIEW_MAX_TOKENS_LIMIT,
      1024,
      1,
    ),
  },
  generation: {
    temperature: defaultTemperature,
    maxTokens: numberFromEnv(
      import.meta.env.VITE_REVIEW_MAX_TOKENS,
      512,
      1,
    ),
  },
};

export const REVIEW_CONFIG = {
  defaultModelId: tinySwallowModel.id,
  models: [tinySwallowModel],
  model: tinySwallowModel,
  limits: tinySwallowModel.limits,
  generation: tinySwallowModel.generation,
  parameterMins: {
    maxTokens: numberFromEnv(
      import.meta.env.VITE_REVIEW_MAX_TOKENS_MIN,
      1,
      1,
    ),
  },
  temperature: {
    min: temperatureMin,
    max: temperatureMax,
    step: numberFromEnv(import.meta.env.VITE_REVIEW_TEMPERATURE_STEP, 0.1, 0.01),
  },
  tokenChoices: [
    {
      value: numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_SHORT, 256, 1),
      labelKey: "token.short",
    },
    {
      value: tokenMedium,
      labelKey: "token.medium",
    },
    {
      value: numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_STANDARD, 512, 1),
      labelKey: "token.standard",
    },
    {
      value: numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_LONG, 768, 1),
      labelKey: "token.long",
    },
    {
      value: numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_EXTENDED, 1024, 1),
      labelKey: "token.extended",
    },
  ] satisfies TokenChoice[],
  phases: {
    browserPrefillSeconds: numberFromEnv(
      import.meta.env.VITE_BROWSER_PREFILL_PHASE_SECONDS,
      1,
      0,
    ),
  },
  webgpu: {
    powerPreference: powerPreferenceFromEnv(
      import.meta.env.VITE_WEBLLM_POWER_PREFERENCE,
    ),
    lowResourceRequired: boolFromEnv(
      import.meta.env.VITE_WEBLLM_LOW_RESOURCE_REQUIRED,
      true,
    ),
  },
  artifacts: {
    huggingfaceRevision: stringFromEnv(
      import.meta.env.VITE_WEBLLM_HF_REVISION,
      "main",
    ),
    configFilename: stringFromEnv(
      import.meta.env.VITE_WEBLLM_CONFIG_FILENAME,
      "mlc-chat-config.json",
    ),
    ndarrayCacheFilename: stringFromEnv(
      import.meta.env.VITE_WEBLLM_NDARRAY_CACHE_FILENAME,
      "ndarray-cache.json",
    ),
    tokenizerFiles:
      tokenizerFiles.length > 0
        ? tokenizerFiles
        : ["tokenizer.json", "tokenizer.model"],
  },
  storage: {
    cacheBackend: cacheBackendFromEnv(
      import.meta.env.VITE_WEBLLM_CACHE_BACKEND,
    ),
    downloadConcurrency: Math.min(
      downloadConcurrencyMax,
      defaultDownloadConcurrency,
    ),
    downloadConcurrencyMax,
    prefetchProgressStart: numberFromEnv(
      import.meta.env.VITE_WEBLLM_PREFETCH_PROGRESS_START,
      0.02,
      0,
    ),
    indexedDbVersion: numberFromEnv(
      import.meta.env.VITE_WEBLLM_INDEXEDDB_VERSION,
      1,
      1,
    ),
    indexedDbStore: stringFromEnv(
      import.meta.env.VITE_WEBLLM_INDEXEDDB_STORE,
      "urls",
    ),
    cacheNames: {
      config: stringFromEnv(
        import.meta.env.VITE_WEBLLM_CONFIG_CACHE,
        "webllm/config",
      ),
      wasm: stringFromEnv(
        import.meta.env.VITE_WEBLLM_WASM_CACHE,
        "webllm/wasm",
      ),
      model: stringFromEnv(
        import.meta.env.VITE_WEBLLM_MODEL_CACHE,
        "webllm/model",
      ),
    },
  },
} as const;

export type ReviewModel = (typeof REVIEW_CONFIG.models)[number];

export function reviewModelForRuntimeId(
  runtimeModelId: string | undefined,
): ReviewModel | undefined {
  if (!runtimeModelId) return undefined;
  const exact = REVIEW_CONFIG.models.find((model) => model.id === runtimeModelId);
  if (exact) return exact;

  const needle = runtimeModelId.toLowerCase();
  return REVIEW_CONFIG.models.find((model) => {
    if (needle.includes(model.id.toLowerCase())) return true;
    const label = model.label.toLowerCase();
    return label.length > 0 && needle.includes(label);
  });
}

export function parametersForModel(model: ReviewModel): ReviewParameters {
  return {
    temperature: model.generation.temperature,
    maxTokens: Math.min(model.generation.maxTokens, model.limits.maxTokens),
  };
}

// WebLLM's public ChatOptions type omits prefill_chunk_size, but custom MLC
// model metadata accepts it and must match the cs1k model library.
export const WEBLLM_APP_CONFIG: AppConfig = {
  model_list: REVIEW_CONFIG.models.map((model) => ({
    model: model.url,
    model_id: model.id,
    model_lib: model.libraryUrl,
    low_resource_required: REVIEW_CONFIG.webgpu.lowResourceRequired,
    vram_required_MB: model.vramRequiredMB,
    overrides: {
      context_window_size: model.contextWindowSize,
      prefill_chunk_size: model.prefillChunkSize,
    },
  })),
  useIndexedDBCache: REVIEW_CONFIG.storage.cacheBackend === "indexeddb",
};
