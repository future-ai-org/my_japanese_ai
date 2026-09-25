import { APP_CONFIG, clampScore } from "../config/app";
import {
  coerceNumber,
  collectMetrics,
  readReviewFinding,
} from "../shared/review";
import type { ReviewResult } from "../types/review";

export interface PartialReviewPayload {
  score?: number;
  summary?: string;
  rationale?: string;
  metrics?: unknown[];
  findings?: unknown[];
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
  } catch {
    return null;
  }
}

function parseOpenString(source: string, index: number): string | undefined {
  if (source[index] !== '"') return undefined;
  let cursor = index + 1;
  let raw = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '"') {
      try {
        return JSON.parse(source.slice(index, cursor + 1)) as string;
      } catch {
        return raw;
      }
    }
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

function parsePartialObject(
  source: string,
  index: number,
): { value: Record<string, unknown>; end: number } | null {
  index = skipWs(source, index);
  if (source[index] !== "{") return null;
  index += 1;
  const value: Record<string, unknown> = {};
  while (index < source.length) {
    index = skipWs(source, index);
    if (index >= source.length || source[index] === "}") break;
    if (source[index] === ",") {
      index += 1;
      continue;
    }
    const keyEnd = scanStringEnd(source, index);
    if (keyEnd === null) break;
    let key: string;
    try {
      key = JSON.parse(source.slice(index, keyEnd)) as string;
    } catch {
      break;
    }
    index = skipWs(source, keyEnd);
    if (source[index] !== ":") break;
    index = skipWs(source, index + 1);
    const parsed = parseCompleteValue(source, index);
    if (!parsed) {
      const partial = parseOpenString(source, index);
      if (partial !== undefined) value[key] = partial;
      break;
    }
    value[key] = parsed.value;
    index = parsed.end;
  }
  return Object.keys(value).length ? { value, end: index } : null;
}

function parseObjectArray(
  source: string,
  index: number,
): { values: unknown[]; end: number; closed: boolean } | null {
  index = skipWs(source, index);
  if (source[index] !== "[") return null;
  index += 1;
  const values: unknown[] = [];
  while (index < source.length) {
    index = skipWs(source, index);
    if (index >= source.length) break;
    if (source[index] === "]") {
      return { values, end: index + 1, closed: true };
    }
    if (source[index] === ",") {
      index += 1;
      continue;
    }
    const parsed = parseCompleteValue(source, index);
    if (!parsed) {
      const partial = parsePartialObject(source, index);
      if (partial) values.push(partial.value);
      break;
    }
    values.push(parsed.value);
    index = parsed.end;
  }
  return { values, end: index, closed: false };
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
    } catch {
      break;
    }
    index = skipWs(text, keyEnd);
    if (text[index] !== ":") break;
    index = skipWs(text, index + 1);

    if (key === "metrics" || key === "findings") {
      if (key === "metrics" && text[index] === "{") {
        const parsedObject = parseCompleteValue(text, index);
        const record = parsedObject
          ? parsedObject.value
          : parsePartialObject(text, index)?.value;
        if (!record || typeof record !== "object" || Array.isArray(record)) break;
        const metrics = collectMetrics(record);
        payload.metrics = metrics;
        if (metrics.length) found = true;
        index = parsedObject?.end ?? text.length;
        if (!parsedObject) break;
        continue;
      }
      const parsed = parseObjectArray(text, index);
      if (!parsed) break;
      payload[key] = parsed.values;
      if (parsed.values.length) found = true;
      index = parsed.end;
      if (!parsed.closed) break;
      continue;
    }

    const parsed = parseCompleteValue(text, index);
    if (!parsed) break;
    if (key === "score") {
      const score = coerceNumber(parsed.value);
      if (score !== undefined) {
        payload.score = score;
        found = true;
      }
    } else if (key === "summary" && typeof parsed.value === "string") {
      payload.summary = parsed.value;
      found = true;
    } else if (key === "rationale" && typeof parsed.value === "string") {
      payload.rationale = parsed.value;
      found = true;
    }
    index = parsed.end;
  }

  return found ? payload : null;
}

export function reviewResultFromPartial(
  payload: PartialReviewPayload,
  options: { lineCount: number; durationMs: number; maxFindings: number },
): ReviewResult | undefined {
  if (typeof payload.score !== "number") return undefined;
  const metrics = collectMetrics(payload.metrics ?? []);
  const findings = (payload.findings ?? [])
    .slice(0, options.maxFindings)
    .flatMap((finding, index) => {
      const item = readReviewFinding(finding, index, {
        lineCount: options.lineCount,
        createId: () => "live",
      });
      return item ? [item] : [];
    });

  return {
    score: clampScore(payload.score ?? APP_CONFIG.score.min),
    summary: payload.summary ?? "",
    rationale: payload.rationale,
    metrics,
    findings,
    durationMs: options.durationMs,
    partial: true,
  };
}

function partialSignature(result: ReviewResult): string {
  return JSON.stringify({
    score: result.score,
    summary: result.summary,
    rationale: result.rationale ?? "",
    metrics: result.metrics,
    findings: result.findings.map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      line: finding.line,
      suggestion: finding.suggestion,
    })),
  });
}

export function isRicherPartial(
  next: ReviewResult,
  previous?: ReviewResult,
): boolean {
  return !previous || partialSignature(next) !== partialSignature(previous);
}
