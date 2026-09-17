import type {
  Language,
  ReviewInferenceTrace,
  ReviewResult,
} from "../types/review.js";
import { numberFromEnv } from "../config/env";
import reviewSystemPrompt from "../../../backend/app/prompts/review_system.txt?raw";
import reviewUserPrompt from "../../../backend/app/prompts/review_user.txt?raw";
import reviewUserPromptDetailed from "../../../backend/app/prompts/review_user_detailed.txt?raw";

// Medium and standard token budgets ask for a longer English lesson.
// Short stays on the compact template so translation + lesson still fit.
export const REVIEW_DETAILED_MIN_TOKENS = numberFromEnv(
  import.meta.env.VITE_REVIEW_DETAILED_MIN_TOKENS,
  numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_MEDIUM, 384, 1),
  1,
);

// Compact grammar for WebLLM: no minItems/minimum keywords that older
// xgrammar builds warn on.
export const WEBLLM_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translation: { type: "string" },
    lesson: { type: "string" },
  },
  required: ["translation", "lesson"],
} as const;

export const WEBLLM_REVIEW_SCHEMA_JSON = JSON.stringify(WEBLLM_REVIEW_SCHEMA);

export const REVIEW_SYSTEM_PROMPT = reviewSystemPrompt.trim();
const REVIEW_USER_PROMPT_TEMPLATE = reviewUserPrompt.trim();
const REVIEW_USER_PROMPT_DETAILED = reviewUserPromptDetailed.trim();

export function createReviewPrompt(
  language: Language,
  code: string,
  maxTokens?: number,
): string {
  const template =
    maxTokens !== undefined && maxTokens >= REVIEW_DETAILED_MIN_TOKENS
      ? REVIEW_USER_PROMPT_DETAILED
      : REVIEW_USER_PROMPT_TEMPLATE;
  return `${template.replaceAll("{language}", language)}\n\n${code}`;
}

function foldKeys(value: Record<string, unknown>): Record<string, unknown> {
  const folded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    folded[key.toLowerCase()] ??= item;
  }
  return folded;
}

export function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceText(value: unknown): string {
  if (typeof value === "string") return value;
  const number = coerceNumber(value);
  return number === undefined ? "" : String(number);
}

/** Strip HTML/markdown the model sometimes leaks into teaching strings. */
export function stripTeachingMarkup(text: string): string {
  let result = text.replace(/<br\s*\/?>/gi, " ");
  result = result.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/g, "");
  // Truncated tag at the end only, e.g. "<span style=".
  result = result.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>\n]*$/g, "");
  result = result
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/__([^_]+)__/g, "$1");
  result = result.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2");
  // Bullet markers at line starts or after breaks the model inserted as <br>*
  result = result.replace(/(^|\s)\*[ \t]+(?=\S)/g, "$1");
  result = result.replace(/(^|\s)\*(?=\s|$)/g, "$1");
  result = result.replace(/\*\*/g, "");
  // Outline labels the small model sometimes echoes from the prompt.
  result = result.replace(
    /(^|\n|[.!?]\s+)(?:register|sentence structure|key vocabulary words?)\s*:\s*/gi,
    "$1",
  );
  // Keep ||| paragraph markers and blank-line breaks; collapse other whitespace.
  result = result.replace(/\r\n?/g, "\n");
  result = result.replace(/[^\S\n]+/g, " ");
  result = result.replace(/ *\n */g, "\n");
  result = result.replace(/([^\n])\n([^\n])/g, "$1 $2");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\s*\|\|\|\s*/g, "|||");
  return result.replace(/^\n+|\n+$/g, "").trim();
}

/** Split a lesson into paragraphs on ||| markers or blank lines. */
export function splitLessonParagraphs(lesson: string): string[] {
  const normalized = lesson.includes("|||")
    ? lesson.split("|||")
    : lesson.split(/\n\n+/);
  return normalized.map((paragraph) => paragraph.trim()).filter(Boolean);
}

function coerceTeachingText(value: unknown): string {
  return stripTeachingMarkup(coerceText(value));
}

export function coerceReviewPayload(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const folded = foldKeys(value as Record<string, unknown>);
  const hasTranslation = "translation" in folded || "summary" in folded;
  const hasLesson = "lesson" in folded || "rationale" in folded || "reason" in folded;
  if (!hasTranslation && !hasLesson) return undefined;
  return {
    translation: coerceTeachingText(folded.translation ?? folded.summary),
    lesson: coerceTeachingText(folded.lesson ?? folded.rationale ?? folded.reason),
  };
}

export function normalizeReviewResult(
  value: unknown,
  options: {
    durationMs: number;
    inference: ReviewInferenceTrace;
  },
): ReviewResult {
  const candidate = coerceReviewPayload(value);
  if (!candidate) {
    throw new Error(
      typeof value === "object" && value
        ? "The model returned an incomplete review."
        : "The model returned an invalid review.",
    );
  }

  return {
    translation: candidate.translation as string,
    lesson: candidate.lesson as string,
    durationMs: options.durationMs,
    inference: options.inference,
  };
}
