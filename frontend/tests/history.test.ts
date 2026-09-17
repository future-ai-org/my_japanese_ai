import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteHistory,
  getHistoryEntry,
  listHistory,
  saveHistory,
  sortHistorySummaries,
  starHistory,
  toHistorySummary,
} from "../src/services/history";
import type { ReviewHistoryEntry } from "../src/types/review";

const entry: ReviewHistoryEntry = {
  id: "8f4cb94c-3396-4d33-9582-b16dcb884ec6",
  language: "polite",
  code: "pass",
  createdAt: "2026-01-01T00:00:00.000Z",
  starred: false,
  result: {
    translation: "よろしくお願いします。",
    lesson: "Good",
    durationMs: 12,
  },
};

const summary = toHistorySummary(entry);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("history service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists history summaries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([summary]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listHistory()).resolves.toEqual([summary]);
    expect(fetchMock).toHaveBeenCalledWith("/api/history", {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("loads a full history entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entry));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHistoryEntry(entry.id)).resolves.toEqual(entry);
    expect(fetchMock).toHaveBeenCalledWith(`/api/history/${entry.id}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("saves a review into history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entry, 201));
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      language: entry.language,
      code: entry.code,
      result: entry.result,
    };
    await expect(saveHistory(payload)).resolves.toEqual(entry);
    expect(fetchMock).toHaveBeenCalledWith("/api/history", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("encodes history identifiers on delete", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteHistory("id/with spaces");
    expect(fetchMock).toHaveBeenCalledWith("/api/history/id%2Fwith%20spaces", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("stars a saved review", async () => {
    const starred = { ...summary, starred: true };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(starred));
    vi.stubGlobal("fetch", fetchMock);

    await expect(starHistory(entry.id, true)).resolves.toEqual(starred);
    expect(fetchMock).toHaveBeenCalledWith(`/api/history/${entry.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: true }),
    });
  });

  it("sorts starred reviews ahead of newer unstarred reviews", () => {
    const newer = { ...summary, id: "newer", createdAt: "2026-06-01T00:00:00.000Z" };
    const favorite = {
      ...summary,
      id: "favorite",
      starred: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    expect(sortHistorySummaries([newer, favorite]).map((item) => item.id)).toEqual([
      "favorite",
      "newer",
    ]);
  });

  it("sorts reviews with the same star status by recency", () => {
    const older = { ...summary, id: "older", createdAt: "2025-01-01T00:00:00.000Z" };
    const newer = { ...summary, id: "newer", createdAt: "2026-06-01T00:00:00.000Z" };
    const olderFavorite = { ...older, id: "older-favorite", starred: true };
    const newerFavorite = { ...newer, id: "newer-favorite", starred: true };
    expect(sortHistorySummaries([older, newer]).map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(
      sortHistorySummaries([olderFavorite, newerFavorite]).map((item) => item.id),
    ).toEqual(["newer-favorite", "older-favorite"]);
  });

  it("surfaces API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Sign in to access history." }, 401),
      ),
    );
    await expect(listHistory()).rejects.toThrow("Sign in to access history.");
  });

  it("falls back when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("broken", { status: 500 })),
    );
    await expect(listHistory()).rejects.toThrow("History request failed.");
  });

  it("omits empty inference fields from summaries", () => {
    expect(
      toHistorySummary({
        ...entry,
        code: "first line\nsecond",
        result: {
          ...entry.result,
          inference: {
            provider: "browser",
            modelId: "",
            startedAt: "2026-01-01T00:00:00.000Z",
            completedAt: "2026-01-01T00:00:01.000Z",
            systemPrompt: "system",
            userPrompt: "user",
            responseSchema: {},
            generationConfig: { temperature: 0.2, maxTokens: 256 },
            finishReason: "stop",
            rawOutput: "{}",
            logs: [],
          },
        },
      }),
    ).toEqual({
      id: entry.id,
      language: "polite",
      createdAt: entry.createdAt,
      codePreview: "first line",
      lineCount: 2,
      characterCount: 17,
      translation: "よろしくお願いします。",
      starred: false,
      provider: "browser",
      temperature: 0.2,
      maxTokens: 256,
      durationMs: 12,
    });
  });

  it("counts empty source as zero lines", () => {
    expect(toHistorySummary({ ...entry, code: "" })).toMatchObject({
      codePreview: "",
      lineCount: 0,
      characterCount: 0,
    });
  });
});
