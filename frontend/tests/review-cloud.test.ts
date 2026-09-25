import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listInferenceProviders,
  reviewCodeCloud,
} from "../src/services/reviewCloud";
import { CloudReviewError } from "../src/review/cloudError";
import type { InferenceProviderInfo, ReviewLogEntry } from "../src/types/review";

const provider: InferenceProviderInfo = {
  id: "modal",
  label: "Modal GPU Cloud",
  modelId: "test-model",
  description: "Runs on a dedicated Modal GPU.",
  temperature: 0.2,
  maxCodeCharacters: 4000,
  maxTokens: 512,
  maxFindings: 3,
  timeoutMs: 55000,
  requestsPerWindow: 10,
  rateLimitWindowMinutes: 60,
};

const request = {
  provider: "modal" as const,
  language: "python" as const,
  code: "print('hi')",
  parameters: { temperature: 0.2, maxTokens: 512, maxFindings: 3 },
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: "OK",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe("listInferenceProviders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns only well-formed provider records", async () => {
    const huggingface = { ...provider, id: "huggingface" as const };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          providers: [provider, huggingface, { id: "modal" }, null, "nope"],
        }),
      ),
    );

    await expect(listInferenceProviders()).resolves.toEqual([
      provider,
      huggingface,
    ]);
  });

  it("returns an empty list when the payload is not an object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("nope")));
    await expect(listInferenceProviders()).resolves.toEqual([]);
  });

  it("returns an empty list when the payload is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null)));
    await expect(listInferenceProviders()).resolves.toEqual([]);
  });

  it("throws the API error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Could not load providers." }, { status: 500 }),
      ),
    );
    await expect(listInferenceProviders()).rejects.toThrow(
      "Could not load providers.",
    );
  });

  it("falls back when an error payload has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("broken", { status: 502 })),
    );
    await expect(listInferenceProviders()).rejects.toThrow(
      "Could not load cloud inference providers.",
    );
  });
});

describe("reviewCodeCloud diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a successful review and emits request logs", async () => {
    const entries: ReviewLogEntry[] = [];
    const result = {
      score: 80,
      summary: "Solid",
      findings: [],
      metrics: [],
      durationMs: 12,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...result,
          inference: {
            logs: [
              {
                id: "upstream-ok",
                timestamp: "2026-01-01T00:00:00.000Z",
                level: "debug",
                stage: "cloud-http",
                message: "Upstream responded HTTP 200 OK.",
              },
            ],
          },
        }),
      ),
    );

    await expect(reviewCodeCloud(request, (entry) => entries.push(entry))).resolves.toMatchObject(
      result,
    );
    expect(entries.some((entry) => entry.message.includes("Connecting to the cloud GPU"))).toBe(
      true,
    );
    expect(entries.some((entry) => entry.message.includes("Sending code"))).toBe(
      true,
    );
    expect(
      entries.some(
        (entry) =>
          entry.stage === "cloud-http" &&
          entry.message.includes("HTTP 200"),
      ),
    ).toBe(true);
    expect(
      entries.some((entry) => entry.message.includes("received and validated")),
    ).toBe(true);
  });

  it("redacts cookie headers from logged responses", async () => {
    const entries: ReviewLogEntry[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { score: 1, summary: "ok", findings: [], metrics: [], durationMs: 1 },
          { headers: { "set-cookie": "ai_session=secret", "content-type": "application/json" } },
        ),
      ),
    );

    await reviewCodeCloud(request, (entry) => entries.push(entry));
    const responseLog = entries.find((entry) =>
      entry.message.includes("API responded HTTP 200"),
    );
    const headers = (responseLog?.details as { headers?: Record<string, string> })
      ?.headers;
    expect(headers?.["set-cookie"]).toBe("[redacted]");
  });

  it("wraps non-Error fetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    await expect(reviewCodeCloud(request)).rejects.toThrow(
      "Cloud inference request failed.",
    );
  });

  it("rethrows aborted fetches", async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(reviewCodeCloud(request)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("rejects a non-object success payload", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("just text", { status: 200 })),
    );
    await expect(reviewCodeCloud(request)).rejects.toThrow(
      "Cloud inference returned an invalid review.",
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("non-object review payload"),
      expect.anything(),
    );
  });

  it("emits debug logs for the API response and backend diagnostics", async () => {
    const entries: ReviewLogEntry[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error:
              "Modal's cloud inference provider sometimes needs a moment to start up a sleeping container. This is a normal behaviour. Wait a minute and try again. (HTTP 503 Service Unavailable)",
            diagnostics: {
              logs: [
                {
                  id: "upstream-1",
                  timestamp: "2026-01-01T00:00:00.000Z",
                  level: "debug",
                  stage: "cloud-http",
                  message: "Upstream responded HTTP 503 Service Unavailable.",
                  details: {
                    status: 503,
                    reason: "Service Unavailable",
                    body: "",
                    headers: { "content-length": "0" },
                  },
                },
                { id: "ignored" },
                null,
              ],
            },
          }),
          {
            status: 502,
            statusText: "Bad Gateway",
            headers: { "content-type": "application/json", "x-request-id": "abc" },
          },
        ),
      ),
    );

    const error = await reviewCodeCloud(request, (entry) =>
      entries.push(entry),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudReviewError);
    expect(error).toMatchObject({ message: expect.stringMatching(/start up/) });

    expect(entries.some((entry) => entry.level === "debug")).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.stage === "cloud-http" &&
          entry.message.includes("HTTP 503") &&
          (entry.details as { status?: number } | undefined)?.status === 503,
      ),
    ).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.stage === "cloud-request" &&
          entry.message.includes("HTTP 502") &&
          (entry.details as { body?: { diagnostics?: unknown } } | undefined)
            ?.body !== undefined,
      ),
    ).toBe(true);
  });
});
