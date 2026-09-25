import {
  CreateWebWorkerMLCEngine,
  type InitProgressReport,
  type MLCEngineInterface,
} from "@mlc-ai/web-llm";
import {
  createReviewPrompt,
  REVIEW_CONFIG,
  REVIEW_SYSTEM_PROMPT,
  WEBLLM_APP_CONFIG,
  WEBLLM_REVIEW_SCHEMA,
  WEBLLM_REVIEW_SCHEMA_JSON,
} from "../config/review";
import { isAbortError, throwIfAborted, withAbort } from "../review/abort";
import { clampDownloadConcurrency } from "../review/artifactPrefetch";
import {
  isWebLlmProgressTick,
  progressLogFingerprint,
  webLlmProgressRatio,
} from "../review/loadingPhase";
import {
  isRicherPartial,
  parsePartialReview,
  reviewResultFromPartial,
} from "../review/partialReview";
import {
  createResumePrompt,
  joinResumedOutput,
  ReviewInterruptedError,
} from "../review/resume";
import { createThrottledStreamProgress } from "../review/streamProgress";
import {
  WEBGPU_ADAPTER_MESSAGE,
  WEBGPU_UNAVAILABLE_MESSAGE,
} from "../review/webgpuError";
import { parseReviewOutput } from "../review/parseOutput";
import { normalizeReviewResult } from "../shared/review";
import type {
  ReviewInferenceTrace,
  ReviewLogEntry,
  ReviewLogLevel,
  ReviewRunRequest,
  ReviewResult,
} from "../types/review";

export interface ModelProgress {
  progress: number;
  text: string;
  elapsedSeconds?: number;
  streamedText?: string;
  result?: ReviewResult;
}

export const SOFTWARE_GPU_MESSAGE =
  "WebGPU is using a software adapter. TinySwallow will still run in this browser; generation may be slow.";

const SOFTWARE_ADAPTER_PATTERN =
  /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;

type ProgressListener = (progress: ModelProgress) => void;
type LogListener = (entry: ReviewLogEntry) => void;

interface WebGpuAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface WebGpuAdapterProbe {
  isFallbackAdapter?: boolean;
  info?: WebGpuAdapterInfo;
  limits?: { maxStorageBufferBindingSize?: number };
  requestAdapterInfo?: () => Promise<WebGpuAdapterInfo>;
}

interface WebGpu {
  requestAdapter?: (options?: {
    powerPreference?: "high-performance" | "low-power";
  }) => Promise<WebGpuAdapterProbe | null>;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
}

interface ChatCompletionRequest {
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature: number;
  max_tokens: number;
  stream: true;
  response_format?: { type: "json_object"; schema?: string };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}

function attachGenerateInterrupt(
  engine: MLCEngineInterface,
  signal?: AbortSignal,
): () => void {
  const interrupt = (
    engine as MLCEngineInterface & { interruptGenerate?: () => void }
  ).interruptGenerate;
  if (!signal || typeof interrupt !== "function") return () => {};
  const onAbort = () => {
    try {
      interrupt.call(engine);
    } catch {
      /* WebLLM may already be idle */
    }
  };
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener("abort", onAbort);
  return () => signal.removeEventListener("abort", onAbort);
}

let enginePromise: Promise<MLCEngineInterface> | null = null;
let storageReady = false;
let lastModelLoadLogKey = "";
const progressListeners = new Set<ProgressListener>();
const logListeners = new Set<LogListener>();

function publishLog(
  level: ReviewLogLevel,
  stage: string,
  message: string,
  details?: unknown,
) {
  const entry: ReviewLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    details,
  };

  const consoleArgs =
    details === undefined
      ? [`[TinySwallow:${stage}] ${message}`]
      : [`[TinySwallow:${stage}] ${message}`, details];
  if (level === "error") console.error(...consoleArgs);
  else if (level === "warning") console.warn(...consoleArgs);
  else if (level === "debug") console.debug(...consoleArgs);
  else console.info(...consoleArgs);

  logListeners.forEach((listener) => listener(entry));
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return error;
  const candidate = error as Record<string, unknown>;
  return {
    name: candidate.name,
    message: candidate.message,
    stack: candidate.stack,
    cause: candidate.cause,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  return typeof error === "string" ? error : "Unknown review failure.";
}

function assertWebGpuAvailable() {
  if (!("gpu" in navigator)) {
    throw new Error(WEBGPU_UNAVAILABLE_MESSAGE);
  }
}

async function probeWebGpuAdapter() {
  const gpu = (navigator as Navigator & { gpu?: WebGpu }).gpu;
  if (!gpu) {
    throw new Error(WEBGPU_UNAVAILABLE_MESSAGE);
  }
  if (typeof gpu.requestAdapter !== "function") {
    return;
  }

  const adapter = await gpu.requestAdapter({
    powerPreference: REVIEW_CONFIG.webgpu.powerPreference,
  });
  if (!adapter) {
    throw new Error(WEBGPU_ADAPTER_MESSAGE);
  }

  let info = adapter.info;
  if (!info && typeof adapter.requestAdapterInfo === "function") {
    info = await adapter.requestAdapterInfo().catch(() => undefined);
  }
  const label = [
    info?.vendor,
    info?.architecture,
    info?.device,
    info?.description,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const fallback = adapter.isFallbackAdapter === true;
  publishLog("info", "gpu", "WebGPU adapter selected.", {
    vendor: info?.vendor,
    architecture: info?.architecture,
    device: info?.device,
    description: info?.description,
    isFallbackAdapter: fallback,
    maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize,
    powerPreference: REVIEW_CONFIG.webgpu.powerPreference,
  });
  publishModelProgress({
    progress: 0,
    text: label
      ? `Selecting a WebGPU adapter (${label})…`
      : "Selecting a WebGPU adapter…",
  });

  if (fallback || SOFTWARE_ADAPTER_PATTERN.test(label)) {
    publishLog("warning", "gpu", SOFTWARE_GPU_MESSAGE);
  }
}

async function ensureStorageReady() {
  if (storageReady) return;

  if (!navigator.storage) {
    publishLog("warning", "storage", "Browser storage diagnostics are unavailable.");
    publishModelProgress({
      progress: 0,
      text: "Checking browser storage…",
    });
    storageReady = true;
    return;
  }

  const persistent = await navigator.storage.persist().catch(() => false);
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  const available = Math.max(0, quota - usage);
  publishLog("info", "storage", "Browser model storage availability.", {
    backend: REVIEW_CONFIG.storage.cacheBackend,
    persistent,
    usageMB: Math.round(usage / 1024 / 1024),
    quotaMB: Math.round(quota / 1024 / 1024),
    availableMB: Math.round(available / 1024 / 1024),
    modelDownloadMB: REVIEW_CONFIG.model.downloadSizeMB,
  });
  publishModelProgress({
    progress: 0,
    text: "Checking browser storage…",
  });

  if (quota > 0 && available < REVIEW_CONFIG.model.downloadSizeMB * 1024 * 1024) {
    throw new Error(
      `The browser reports only ${Math.round(available / 1024 / 1024).toLocaleString()} MB of available site storage; TinySwallow needs approximately ${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB.`,
    );
  }

  storageReady = true;
}

function publishModelProgress(progress: ModelProgress) {
  progressListeners.forEach((listener) => listener(progress));
}

function publishProgress(report: InitProgressReport) {
  const text =
    report.text === "Start to fetch params"
      ? "Start to fetch parameters."
      : report.text;
  const progress = {
    progress: webLlmProgressRatio(report.progress, text),
    text,
    elapsedSeconds: report.timeElapsed,
  };
  if (!isWebLlmProgressTick(text)) {
    const key = progressLogFingerprint(text);
    if (key !== lastModelLoadLogKey) {
      lastModelLoadLogKey = key;
      publishLog("debug", "model-load", text, {
        progress: progress.progress,
        elapsedSeconds: report.timeElapsed,
      });
    }
  }
  publishModelProgress(progress);
}

async function prefetchArtifactsInWorker() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  publishLog(
    "info",
    "model-load",
    "Prefetching TinySwallow artifacts in parallel.",
    {
      concurrency: REVIEW_CONFIG.storage.downloadConcurrency,
      wasm: REVIEW_CONFIG.model.libraryUrl,
    },
  );
  publishModelProgress({
    progress: 0,
    text: "Prefetching model artifacts…",
  });

  const worker = new Worker(new URL("../workers/prefetch.ts", import.meta.url), {
    type: "module",
  });
  const started = performance.now();
  try {
    await new Promise<void>((resolve, reject) => {
      worker.onerror = (event) => {
        reject(event.error ?? new Error(event.message));
      };
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { type: "progress"; progress: number; text: string }
          | { type: "done"; status?: string }
          | { type: "error"; message: string }
          | undefined;
        if (!data) return;
        if (data.type === "progress") {
          publishModelProgress({
            progress: data.progress,
            text: data.text,
            elapsedSeconds: (performance.now() - started) / 1000,
          });
          return;
        }
        if (data.type === "done") {
          publishLog(
            "info",
            "model-load",
            data.status === "cached"
              ? "TinySwallow artifacts were already cached."
              : "TinySwallow artifacts cached; starting WebLLM.",
          );
          resolve();
          return;
        }
        if (data.type === "error") {
          reject(new Error(data.message));
        }
      };
      worker.postMessage({
        modelUrl: REVIEW_CONFIG.model.url,
        wasmUrl: REVIEW_CONFIG.model.libraryUrl,
        concurrency: clampDownloadConcurrency(
          REVIEW_CONFIG.storage.downloadConcurrency,
        ),
      });
    });
  } catch (error) {
    publishLog(
      "warning",
      "model-load",
      "Parallel artifact prefetch failed; WebLLM will download shards itself.",
      getErrorDetails(error),
    );
  } finally {
    worker.terminate();
  }
}

async function createEngine(): Promise<MLCEngineInterface> {
  lastModelLoadLogKey = "";
  const worker = new Worker(new URL("../workers/webllm.ts", import.meta.url), {
    type: "module",
  });
  let rejectForWorkerCrash: ((error: Error) => void) | undefined;
  const workerCrashed = new Promise<never>((_, reject) => {
    rejectForWorkerCrash = reject;
  });
  worker.onerror = (event) => {
    const error =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || "WebLLM worker crashed.");
    publishLog("error", "worker", error.message, getErrorDetails(error));
    if (rejectForWorkerCrash) {
      rejectForWorkerCrash(error);
      return;
    }
    enginePromise = null;
  };
  try {
    await Promise.all([probeWebGpuAdapter(), prefetchArtifactsInWorker()]);
    const engine = await Promise.race([
      CreateWebWorkerMLCEngine(worker, REVIEW_CONFIG.model.id, {
        appConfig: WEBLLM_APP_CONFIG,
        initProgressCallback: publishProgress,
      }),
      workerCrashed,
    ]);
    rejectForWorkerCrash = undefined;
    return engine;
  } catch (error) {
    worker.terminate();
    throw error;
  }
}

function getEngine(onProgress?: ProgressListener) {
  assertWebGpuAvailable();
  if (onProgress) progressListeners.add(onProgress);

  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }

  return enginePromise.finally(() => {
    if (onProgress) progressListeners.delete(onProgress);
  });
}

export function preloadBrowserModel(
  onProgress?: ProgressListener,
  onLog?: LogListener,
): Promise<MLCEngineInterface> {
  if (onProgress) progressListeners.add(onProgress);
  if (onLog) logListeners.add(onLog);
  return (async () => {
    try {
      await ensureStorageReady();
      return await getEngine();
    } finally {
      if (onProgress) progressListeners.delete(onProgress);
      if (onLog) logListeners.delete(onLog);
    }
  })();
}

function isAsyncIterable(
  value: unknown,
): value is AsyncIterable<ChatCompletionChunk> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
        "function",
  );
}

async function readChatCompletion(
  engine: MLCEngineInterface,
  request: ChatCompletionRequest,
  signal: AbortSignal | undefined,
  onDelta: (content: string) => void,
): Promise<{
  content: string;
  finishReason: string | null;
  usage: unknown;
}> {
  const detachInterrupt = attachGenerateInterrupt(engine, signal);
  try {
    const response = await withAbort(
      engine.chat.completions.create(request),
      signal,
    );

    if (isAsyncIterable(response)) {
      let content = "";
      let finishReason: string | null = null;
      let usage: unknown;
      const iterator = response[Symbol.asyncIterator]();
      try {
        while (true) {
          throwIfAborted(signal);
          const next = await withAbort(
            Promise.resolve(iterator.next()),
            signal,
          );
          if (next.done) break;
          const choice = next.value.choices?.[0];
          const delta = asText(choice?.delta?.content);
          if (delta) {
            content += delta;
            onDelta(content);
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (next.value.usage !== undefined) usage = next.value.usage;
        }
      } catch (error) {
        if (isAbortError(error) && typeof iterator.return === "function") {
          void iterator.return();
        }
        throw error;
      }
      throwIfAborted(signal);
      return { content, finishReason, usage };
    }

    throwIfAborted(signal);
    const completion = response as ChatCompletionResponse;
    const choice = completion.choices?.[0];
    const content = asText(choice?.message?.content);
    if (content) onDelta(content);
    return {
      content,
      finishReason: choice?.finish_reason ?? null,
      usage: completion.usage,
    };
  } finally {
    detachInterrupt();
  }
}

export async function reviewCode(
  request: ReviewRunRequest,
  onProgress?: ProgressListener,
  onLog?: LogListener,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const capturedLogs: ReviewLogEntry[] = [];
  const captureLog: LogListener = (entry) => capturedLogs.push(entry);
  if (onProgress) progressListeners.add(onProgress);
  if (onLog) logListeners.add(onLog);
  logListeners.add(captureLog);
  let streamProgress: ReturnType<typeof createThrottledStreamProgress> | undefined;
  let engine: MLCEngineInterface | undefined;

  try {
    throwIfAborted(signal);
    if (request.code.length > REVIEW_CONFIG.limits.maxCodeCharacters) {
      throw new Error(
        `This browser model accepts up to ${REVIEW_CONFIG.limits.maxCodeCharacters.toLocaleString()} code characters per review.`,
      );
    }

    const startedAt = performance.now();
    const startedAtIso = new Date().toISOString();
    const lineCount = request.code.split("\n").length;
    const resumeFrom = request.resumeFrom ?? "";
    const resumeElapsedMs = request.resumeElapsedMs ?? 0;
    const systemPrompt = REVIEW_SYSTEM_PROMPT;
    const userPrompt = createReviewPrompt(
      request.language,
      request.code,
      request.parameters.maxTokens,
    );
    const resumePrompt = resumeFrom ? createResumePrompt(resumeFrom) : undefined;
    publishLog(
      "info",
      "review",
      resumeFrom
        ? "Resuming the interrupted local review."
        : "Starting a local code review.",
      {
        language: request.language,
        characters: request.code.length,
        lines: lineCount,
        generation: request.parameters,
        resumeFromCharacters: resumeFrom.length || undefined,
      },
    );

    await ensureStorageReady();
    throwIfAborted(signal);
    engine = await withAbort(getEngine(), signal);
    const engineReadyMs = Math.round(performance.now() - startedAt);
    throwIfAborted(signal);
    if (typeof engine.resetChat === "function") {
      await withAbort(Promise.resolve(engine.resetChat()), signal);
    }
    const analyzingStartedAt = performance.now();
    const promptCharacters =
      systemPrompt.length + userPrompt.length + (resumePrompt?.length ?? 0);
    onProgress?.({
      progress: 1,
      text: "Prefilling the prompt on WebGPU…",
      streamedText: resumeFrom || undefined,
    });
    publishLog("info", "generation", "Submitting the streaming inference request.", {
      modelId: REVIEW_CONFIG.model.id,
      systemPrompt,
      userPrompt,
      resumePrompt,
      responseSchema: WEBLLM_REVIEW_SCHEMA,
      generationConfig: request.parameters,
      stream: true,
      promptCharacters,
      prefillChunkSize: REVIEW_CONFIG.model.prefillChunkSize,
      engineReadyMs,
    });
    publishLog(
      "info",
      "generation",
      "Local model is ready. Prefilling the prompt on WebGPU.",
      {
        engineReadyMs,
        promptCharacters,
        prefillChunkSize: REVIEW_CONFIG.model.prefillChunkSize,
        lines: lineCount,
        characters: request.code.length,
        language: request.language,
      },
    );

    let firstTokenMs: number | undefined;
    let partialResult: ReviewResult | undefined;
    let visibleContent = resumeFrom;
    const elapsedMs = () =>
      Math.round(performance.now() - startedAt) + resumeElapsedMs;
    const streaming = createThrottledStreamProgress((progress) => {
      const parsed = parsePartialReview(progress.streamedText);
      const next = parsed
        ? reviewResultFromPartial(parsed, {
            lineCount,
            durationMs: elapsedMs(),
            maxFindings: request.parameters.maxFindings,
          })
        : undefined;
      if (next && isRicherPartial(next, partialResult)) {
        partialResult = next;
      }
      onProgress?.({
        ...progress,
        elapsedSeconds: (performance.now() - analyzingStartedAt) / 1000,
        streamedText: partialResult ? undefined : progress.streamedText,
        result: partialResult,
      });
    });
    streamProgress = streaming;
    const completionRequest: ChatCompletionRequest = {
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
        ...(resumePrompt
          ? [{ role: "user" as const, content: resumePrompt }]
          : []),
      ],
      temperature: request.parameters.temperature,
      max_tokens: request.parameters.maxTokens,
      stream: true,
    };
    if (!resumeFrom) {
      completionRequest.response_format = {
        type: "json_object",
        schema: WEBLLM_REVIEW_SCHEMA_JSON,
      };
    }
    let content: string;
    let finishReason: string | null;
    let usage: unknown;
    try {
      const completion = await readChatCompletion(
        engine,
        completionRequest,
        signal,
        (streamedText) => {
          visibleContent = resumeFrom
            ? joinResumedOutput(resumeFrom, streamedText)
            : streamedText;
          if (firstTokenMs === undefined) {
            firstTokenMs = Math.round(performance.now() - startedAt);
            publishLog(
              "info",
              "generation",
              "First token received from the local model.",
              {
                firstTokenMs,
                outputCharacters: visibleContent.length,
              },
            );
          }
          streaming.push(visibleContent);
        },
      );
      content = resumeFrom
        ? joinResumedOutput(resumeFrom, completion.content)
        : completion.content;
      finishReason = completion.finishReason;
      usage = completion.usage;
    } catch (error) {
      streaming.flush();
      if (!isAbortError(error)) throw error;
      if (!visibleContent) throw error;
      try {
        JSON.parse(visibleContent);
        content = visibleContent;
        finishReason = "abort";
        usage = undefined;
      } catch {
        throw new ReviewInterruptedError(visibleContent, {
          elapsedMs: elapsedMs(),
          partialResult,
        });
      }
    }
    streaming.flush();

    publishLog("info", "generation", "TinySwallow generation completed.", {
      finishReason,
      usage,
      engineReadyMs,
      firstTokenMs,
      completedMs: Math.round(performance.now() - startedAt),
    });
    publishLog("debug", "model-output", "Raw model output.", content);

    if (!content) {
      throw new Error("TinySwallow did not return a review.");
    }

    const parsed = parseReviewOutput(content);

    const inference: ReviewInferenceTrace = {
      provider: "browser",
      modelId: REVIEW_CONFIG.model.id,
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      systemPrompt,
      userPrompt,
      responseSchema: WEBLLM_REVIEW_SCHEMA,
      generationConfig: {
        temperature: request.parameters.temperature,
        maxTokens: request.parameters.maxTokens,
        maxFindings: request.parameters.maxFindings,
      },
      finishReason,
      usage,
      rawOutput: content,
      logs: [],
    };
    const result = normalizeReviewResult(parsed, {
      lineCount,
      durationMs: elapsedMs(),
      maxFindings: request.parameters.maxFindings,
      inference,
      createId: () => crypto.randomUUID(),
    });
    publishLog("info", "review", "Review output validated.", {
      score: result.score,
      rationale: result.rationale,
      findings: result.findings,
      metrics: result.metrics,
    });
    onProgress?.({
      progress: 1,
      text: "Review output validated.",
      elapsedSeconds: (performance.now() - analyzingStartedAt) / 1000,
      result,
    });

    try {
      inference.runtimeStats = await engine.runtimeStatsText();
      publishLog(
        "debug",
        "runtime",
        "WebLLM runtime statistics.",
        inference.runtimeStats,
      );
    } catch (error) {
      publishLog(
        "warning",
        "runtime",
        "Could not read optional runtime statistics.",
        getErrorDetails(error),
      );
    }

    inference.logs = [...capturedLogs];
    return result;
  } catch (error) {
    if (isAbortError(error)) throw error;
    publishLog(
      "error",
      "review",
      getErrorMessage(error),
      getErrorDetails(error),
    );
    if (error instanceof Error) throw error;
    throw new Error(getErrorMessage(error), { cause: error });
  } finally {
    streamProgress?.cancel();
    const detach = () => {
      if (onProgress) progressListeners.delete(onProgress);
      if (onLog) logListeners.delete(onLog);
      logListeners.delete(captureLog);
    };
    if (engine && typeof engine.resetChat === "function") {
      void Promise.resolve(engine.resetChat())
        .then(() => {
          publishLog("debug", "runtime", "Cleared the generation cache.");
        })
        .catch((error) => {
          publishLog(
            "warning",
            "runtime",
            "Could not clear the generation cache.",
            getErrorDetails(error),
          );
        })
        .finally(detach);
    } else {
      detach();
    }
  }
}
