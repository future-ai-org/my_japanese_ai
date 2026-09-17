import { stripTeachingMarkup } from "../shared/review";
import type { ReviewResult } from "../types/review";

export interface PartialReviewPayload {
  translation?: string;
  lesson?: string;
}

function skipWs(source: string, index: number): number {
  while (index < source.length) {
    const char = source[index];
    if (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") break;
    index += 1;
  }
  return index;
}

function scanStringEnd(source: string, index: number): number | null {
  if (source[index] !== '"') return null;
  index += 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') return index + 1;
    if (char === "\\") {
      if (index + 1 >= source.length) return null;
      if (source[index + 1] === "u") {
        if (index + 6 > source.length) return null;
        index += 6;
        continue;
      }
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}

function scanNumberEnd(source: string, index: number): number | null {
  if (source[index] === "-") index += 1;
  if (index >= source.length) return null;
  if (source[index] === "0") {
    index += 1;
  } else if (source[index] >= "1" && source[index] <= "9") {
    while (index < source.length && source[index] >= "0" && source[index] <= "9") {
      index += 1;
    }
  } else {
    return null;
  }
  if (source[index] === ".") {
    index += 1;
    if (index >= source.length || source[index] < "0" || source[index] > "9") {
      return null;
    }
    while (index < source.length && source[index] >= "0" && source[index] <= "9") {
      index += 1;
    }
  }
  if (source[index] === "e" || source[index] === "E") {
    index += 1;
    if (source[index] === "+" || source[index] === "-") index += 1;
    if (index >= source.length || source[index] < "0" || source[index] > "9") {
      return null;
    }
    while (index < source.length && source[index] >= "0" && source[index] <= "9") {
      index += 1;
    }
  }
  if (index >= source.length) return null;
  const next = source[index];
  if (
    next === "." ||
    next === "e" ||
    next === "E" ||
    (next >= "0" && next <= "9")
  ) {
    return null;
  }
  return index;
}

function scanLiteralEnd(
  source: string,
  index: number,
  literal: string,
): number | null {
  if (source.startsWith(literal, index)) return index + literal.length;
  return null;
}

function scanContainerEnd(
  source: string,
  index: number,
  open: "{" | "[",
  close: "}" | "]",
): number | null {
  let depth = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const end = scanStringEnd(source, index);
      if (end === null) return null;
      index = end;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return null;
}

function scanValueEnd(source: string, index: number): number | null {
  index = skipWs(source, index);
  if (index >= source.length) return null;
  const char = source[index];
  if (char === '"') return scanStringEnd(source, index);
  if (char === "-" || (char >= "0" && char <= "9")) {
    return scanNumberEnd(source, index);
  }
  if (char === "{") return scanContainerEnd(source, index, "{", "}");
  if (char === "[") return scanContainerEnd(source, index, "[", "]");
  if (char === "t") return scanLiteralEnd(source, index, "true");
  if (char === "f") return scanLiteralEnd(source, index, "false");
  if (char === "n") return scanLiteralEnd(source, index, "null");
  return null;
}

export function parseJsonValue(
  source: string,
  index = 0,
): { value: unknown; end: number } | null {
  return parseCompleteValue(source, index);
}

function parseCompleteValue(
  source: string,
  index: number,
): { value: unknown; end: number } | null {
  const end = scanValueEnd(source, index);
  if (end === null) return null;
  try {
    return { value: JSON.parse(source.slice(index, end)), end };
    /* v8 ignore start */
  } catch {
    return null;
  }
  /* v8 ignore stop */
}

function parseOpenString(source: string, index: number): string | undefined {
  if (source[index] !== '"') return undefined;
  let cursor = index + 1;
  let raw = "";
  while (cursor < source.length) {
    const char = source[cursor];
    // A closed string is handled by parseCompleteValue; this path is only for
    // still-streaming quotes.
    if (char === '"') return undefined;
    if (char === "\\") {
      if (cursor + 1 >= source.length) break;
      raw += source.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    raw += char;
    cursor += 1;
  }
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

export function parsePartialReview(text: string): PartialReviewPayload | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const payload: PartialReviewPayload = {};
  let index = start + 1;
  let found = false;

  while (index < text.length) {
    index = skipWs(text, index);
    if (index >= text.length) break;
    if (text[index] === "}") break;
    if (text[index] === ",") {
      index += 1;
      continue;
    }
    const keyEnd = scanStringEnd(text, index);
    if (keyEnd === null) break;
    let key: string;
    try {
      key = JSON.parse(text.slice(index, keyEnd)) as string;
      /* v8 ignore start */
    } catch {
      break;
    }
    /* v8 ignore stop */
    index = skipWs(text, keyEnd);
    if (text[index] !== ":") break;
    index = skipWs(text, index + 1);

    const parsed = parseCompleteValue(text, index);
    if (!parsed) {
      const open = parseOpenString(text, index);
      if (open === undefined) break;
      if (key === "translation" || key === "summary") {
        payload.translation = open;
        found = true;
      } else if (key === "lesson" || key === "rationale") {
        payload.lesson = open;
        found = true;
      }
      break;
    }
    if (
      (key === "translation" || key === "summary") &&
      typeof parsed.value === "string"
    ) {
      payload.translation = parsed.value;
      found = true;
    } else if (
      (key === "lesson" || key === "rationale") &&
      typeof parsed.value === "string"
    ) {
      payload.lesson = parsed.value;
      found = true;
    }
    index = parsed.end;
  }

  return found ? payload : null;
}

export function reviewResultFromPartial(
  payload: PartialReviewPayload,
  options: { durationMs: number },
): ReviewResult | undefined {
  if (payload.translation === undefined && payload.lesson === undefined) {
    return undefined;
  }

  return {
    translation: payload.translation ?? "",
    lesson: stripTeachingMarkup(payload.lesson ?? ""),
    durationMs: options.durationMs,
    partial: true,
  };
}

function partialSignature(result: ReviewResult): string {
  return JSON.stringify({
    translation: result.translation,
    lesson: result.lesson,
  });
}

export function isRicherPartial(
  next: ReviewResult,
  previous?: ReviewResult,
): boolean {
  return !previous || partialSignature(next) !== partialSignature(previous);
}
