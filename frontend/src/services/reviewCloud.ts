import { APP_CONFIG } from "../config/app";
import { isAbortError } from "../review/abort";
import {
  CloudReviewError,
  startupKindForStatus,
} from "../review/cloudError";
import {
  isCloudInferenceProvider,
  type CloudReviewRequest,
  type InferenceProviderInfo,
  type ReviewLogEntry,
  type ReviewLogLevel,
  type ReviewResult,
} from "../types/review";

type LogListener = (entry: ReviewLogEntry) => void;

const LOG_LEVELS = new Set<ReviewLogLevel>([
  "debug",
  "info",
  "warning",
  "error",
]);

async function readPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

function headerRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] =
      key.toLowerCase() === "set-cookie" || key.toLowerCase() === "cookie"
        ? "[redacted]"
        : value;
  });
  return record;
}

function isReviewLogEntry(value: unknown): value is ReviewLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof entry.stage === "string" &&
    typeof entry.message === "string" &&
    typeof entry.level === "string" &&
    LOG_LEVELS.has(entry.level as ReviewLogLevel)
  );
}

function collectBackendLogs(payload: unknown): ReviewLogEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const buckets: unknown[] = [];
  const diagnostics = record.diagnostics;
  if (diagnostics && typeof diagnostics === "object") {
    const logs = (diagnostics as Record<string, unknown>).logs;
    if (Array.isArray(logs)) buckets.push(...logs);
  }
  const inference = record.inference;
  if (inference && typeof inference === "object") {
    const logs = (inference as Record<string, unknown>).logs;
    if (Array.isArray(logs)) buckets.push(...logs);
  }
  return buckets.filter(isReviewLogEntry);
}

function emitLog(
  onLog: LogListener | undefined,
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
  const args =
    details === undefined
      ? [`[cloud:${stage}] ${message}`]
      : [`[cloud:${stage}] ${message}`, details];
  if (level === "error") console.error(...args);
  else if (level === "warning") console.warn(...args);
  else console.debug(...args);
  onLog?.(entry);
}

export async function listInferenceProviders(): Promise<
  InferenceProviderInfo[]
> {
  const response = await fetch(APP_CONFIG.api.review, {
    credentials: "same-origin",
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new Error(
      errorMessage(payload, "Could not load cloud inference providers."),
    );
  }
  if (!payload || typeof payload !== "object") return [];
  const providers = (payload as Record<string, unknown>).providers;
  if (!Array.isArray(providers)) return [];
  return providers.filter((item): item is InferenceProviderInfo => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.id === "string" &&
      isCloudInferenceProvider(candidate.id) &&
      typeof candidate.label === "string" &&
      typeof candidate.modelId === "string" &&
      typeof candidate.description === "string" &&
      typeof candidate.temperature === "number" &&
      typeof candidate.maxCodeCharacters === "number" &&
      typeof candidate.maxTokens === "number" &&
      typeof candidate.maxFindings === "number" &&
      typeof candidate.timeoutMs === "number" &&
      typeof candidate.requestsPerWindow === "number" &&
      typeof candidate.rateLimitWindowMinutes === "number"
    );
  });
}

export async function reviewCodeCloud(
  request: CloudReviewRequest,
  onLog?: LogListener,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  const started = performance.now();
  emitLog(
    onLog,
    "info",
    "cloud-request",
    "Connecting to the cloud GPU.",
    {
      provider: request.provider,
      language: request.language,
      codeCharacters: request.code.length,
      codeLines: request.code.split("\n").length,
    },
  );
  emitLog(
    onLog,
    "debug",
    "cloud-request",
    "Sending code to the selected cloud inference provider.",
    {
      method: "POST",
      url: APP_CONFIG.api.review,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      provider: request.provider,
      language: request.language,
      code: request.code,
      codeCharacters: request.code.length,
      codeLines: request.code.split("\n").length,
      parameters: request.parameters,
    },
  );

  let response: Response;
  try {
    response = await fetch(APP_CONFIG.api.review, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    emitLog(
      onLog,
      "debug",
      "cloud-request",
      `Browser fetch to ${APP_CONFIG.api.review} failed.`,
      {
        provider: request.provider,
        elapsedMs: Math.round(performance.now() - started),
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      },
    );
    if (isAbortError(error)) throw error;
    throw error instanceof Error
      ? error
      : new Error("Cloud inference request failed.");
  }

  const rawText = await response.text();
  let payload: unknown;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = rawText;
  }

  emitLog(
    onLog,
    "debug",
    "cloud-request",
    `API responded HTTP ${response.status} ${response.statusText}.`.trim(),
    {
      provider: request.provider,
      elapsedMs: Math.round(performance.now() - started),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      redirected: response.redirected,
      type: response.type,
      headers: headerRecord(response.headers),
      body: payload,
      rawText,
      numBytes: rawText.length,
    },
  );

  for (const entry of collectBackendLogs(payload)) {
    onLog?.(entry);
    console.debug(`[cloud:${entry.stage}] ${entry.message}`, entry.details);
  }

  if (!response.ok) {
    const message = errorMessage(payload, "Cloud inference request failed.");
    emitLog(onLog, "error", "cloud-request", message, {
      provider: request.provider,
      status: response.status,
      statusText: response.statusText,
      headers: headerRecord(response.headers),
      body: payload,
    });
    throw new CloudReviewError(message, {
      status: response.status,
      kind: startupKindForStatus(response.status, message),
    });
  }
  if (!payload || typeof payload !== "object") {
    emitLog(
      onLog,
      "warning",
      "cloud-request",
      "Cloud inference returned a non-object review payload.",
      { payload, rawText },
    );
    throw new Error("Cloud inference returned an invalid review.");
  }

  emitLog(
    onLog,
    "debug",
    "cloud-request",
    "Cloud review received and validated.",
    {
      provider: request.provider,
      elapsedMs: Math.round(performance.now() - started),
      result: payload,
    },
  );
  return payload as ReviewResult;
}
