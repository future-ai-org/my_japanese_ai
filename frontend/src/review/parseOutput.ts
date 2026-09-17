import { coerceReviewPayload, stripTeachingMarkup } from "../shared/review";
import { parseJsonValue, parsePartialReview } from "./partialReview";

function unwrapModelText(text: string): string {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function foldedRecord(value: Record<string, unknown>): Record<string, unknown> {
  const folded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    folded[key.toLowerCase()] ??= item;
  }
  return folded;
}

function isReviewObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const folded = foldedRecord(value as Record<string, unknown>);
  if ("translation" in folded || "lesson" in folded) return true;
  // Legacy score/summary payloads from older saved history.
  return "summary" in folded || "rationale" in folded;
}

function findReviewObject(value: unknown): unknown {
  if (isReviewObject(value)) return value;
  if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findReviewObject(nested);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findReviewObject(nested);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function payloadFromPartial(text: string): Record<string, unknown> | undefined {
  const partial = parsePartialReview(text);
  if (!partial) return undefined;
  return {
    translation: partial.translation ?? "",
    lesson: partial.lesson ?? "",
  };
}

export function parseReviewJson(text: string): unknown {
  const stripped = unwrapModelText(text);
  let fallback: unknown;
  try {
    const loaded = JSON.parse(stripped) as unknown;
    const found = findReviewObject(loaded);
    if (found !== undefined) return found;
    fallback = loaded;
  } catch {
    /* scan for an embedded object */
  }

  let index = 0;
  while (index < stripped.length) {
    const start = stripped.indexOf("{", index);
    if (start < 0) break;
    const parsed = parseJsonValue(stripped, start);
    if (!parsed) {
      index = start + 1;
      continue;
    }
    const found = findReviewObject(parsed.value);
    if (found !== undefined) return found;
    if (fallback === undefined && parsed.value && typeof parsed.value === "object") {
      fallback = parsed.value;
    }
    index = parsed.end;
  }

  if (fallback !== undefined) return fallback;
  const partial = payloadFromPartial(stripped) ?? payloadFromPartial(text);
  if (partial) return partial;
  throw new Error("TinySwallow returned invalid JSON.");
}

export function parseReviewOutput(text: string): Record<string, unknown> {
  const parsed = parseReviewJson(text);
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  const coerced =
    coerceReviewPayload(parsed) ?? coerceReviewPayload(payloadFromPartial(text));
  if (!coerced) {
    throw new Error("TinySwallow returned invalid JSON.");
  }
  return {
    ...(record ?? {}),
    translation: stripTeachingMarkup(String(coerced.translation ?? "")),
    lesson: stripTeachingMarkup(String(coerced.lesson ?? "")),
  };
}
