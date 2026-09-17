import { isAbortError } from "./abort";
import type { Language, ReviewResult } from "../types/review";

export interface BrowserReviewCheckpoint {
  code: string;
  language: Language;
  streamedText: string;
  elapsedMs: number;
  partialResult?: ReviewResult;
}

export class ReviewInterruptedError extends Error {
  readonly streamedText: string;
  readonly elapsedMs: number;
  readonly partialResult?: ReviewResult;

  constructor(
    streamedText: string,
    options: { elapsedMs?: number; partialResult?: ReviewResult } = {},
  ) {
    super("Review cancelled.");
    this.name = "AbortError";
    this.streamedText = streamedText;
    this.elapsedMs = options.elapsedMs ?? 0;
    this.partialResult = options.partialResult;
  }
}

export function isReviewInterruptedError(
  error: unknown,
): error is ReviewInterruptedError {
  return (
    isAbortError(error) &&
    typeof (error as ReviewInterruptedError).streamedText === "string" &&
    (error as ReviewInterruptedError).streamedText.length > 0
  );
}

export function createResumePrompt(prefix: string): string {
  return [
    "The previous JSON review was interrupted.",
    "Continue from this exact prefix.",
    "Output only the remaining JSON characters needed to complete the object.",
    "Do not repeat the prefix, and do not wrap the output in markdown.",
    "",
    "PREFIX:",
    prefix,
  ].join("\n");
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function overlapLength(prefix: string, next: string): number {
  const max = Math.min(prefix.length, next.length);
  for (let size = max; size > 0; size -= 1) {
    if (prefix.endsWith(next.slice(0, size))) return size;
  }
  return 0;
}

export function joinResumedOutput(prefix: string, continuation: string): string {
  if (!prefix) return stripMarkdownFence(continuation);
  const next = stripMarkdownFence(continuation);
  if (!next) return prefix;
  if (next.startsWith(prefix)) return next;
  if (prefix.endsWith(next)) return prefix;
  if (next.startsWith("{")) {
    try {
      JSON.parse(next);
      return next;
    } catch {
      /* incomplete JSON fragment */
    }
  }
  return prefix + next.slice(overlapLength(prefix, next));
}

export function checkpointMatches(
  checkpoint: BrowserReviewCheckpoint | null,
  request: { code: string; language: Language },
): checkpoint is BrowserReviewCheckpoint {
  return (
    checkpoint !== null &&
    checkpoint.code === request.code &&
    checkpoint.language === request.language &&
    checkpoint.streamedText.length > 0
  );
}
