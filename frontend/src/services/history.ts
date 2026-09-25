import type {
  ReviewHistoryEntry,
  ReviewHistorySummary,
  ReviewRequest,
  ReviewResult,
} from "../types/review";
import { APP_CONFIG } from "../config/app";

async function historyRequest<T>(
  path = "",
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${APP_CONFIG.api.history}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "History request failed.");
  }

  return response.json() as Promise<T>;
}

export function sortHistorySummaries(
  entries: ReviewHistorySummary[],
): ReviewHistorySummary[] {
  return [...entries].sort((left, right) => {
    if (left.starred !== right.starred) {
      return left.starred ? -1 : 1;
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

export function toHistorySummary(
  entry: ReviewHistoryEntry,
): ReviewHistorySummary {
  const inference = entry.result.inference;
  const config = inference?.generationConfig;
  const summary: ReviewHistorySummary = {
    id: entry.id,
    language: entry.language,
    createdAt: entry.createdAt,
    codePreview: entry.code.split("\n")[0] ?? "",
    lineCount: entry.code ? entry.code.split("\n").length : 0,
    characterCount: entry.code.length,
    score: entry.result.score,
    summary: entry.result.summary,
    starred: Boolean(entry.starred),
  };
  if (inference?.provider) {
    summary.provider = inference.provider;
  }
  if (inference?.modelId) {
    summary.modelId = inference.modelId;
  }
  if (typeof config?.temperature === "number") {
    summary.temperature = config.temperature;
  }
  if (typeof config?.maxTokens === "number") {
    summary.maxTokens = config.maxTokens;
  }
  if (typeof config?.maxFindings === "number") {
    summary.maxFindings = config.maxFindings;
  }
  if (typeof entry.result.durationMs === "number") {
    summary.durationMs = entry.result.durationMs;
  }
  return summary;
}

export function listHistory(): Promise<ReviewHistorySummary[]> {
  return historyRequest<ReviewHistorySummary[]>();
}

export function getHistoryEntry(id: string): Promise<ReviewHistoryEntry> {
  return historyRequest<ReviewHistoryEntry>(`/${encodeURIComponent(id)}`);
}

export function saveHistory(
  review: ReviewRequest & { result: ReviewResult },
): Promise<ReviewHistoryEntry> {
  return historyRequest<ReviewHistoryEntry>("", {
    method: "POST",
    body: JSON.stringify(review),
  });
}

export function starHistory(
  id: string,
  starred: boolean,
): Promise<ReviewHistorySummary> {
  return historyRequest<ReviewHistorySummary>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ starred }),
  });
}

export async function deleteHistory(id: string): Promise<void> {
  await historyRequest<{ deleted: boolean }>(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
