import {
  CANONICAL_METRICS,
  canonicalMetricLabel,
  coerceNumber,
  coerceReviewPayload,
  collectMetrics,
  readReviewMetric,
} from "../shared/review";
import { parseJsonValue, parsePartialReview } from "./partialReview";
import { APP_CONFIG, clampScore } from "../config/app";

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

function isLoneMetricObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const folded = foldedRecord(value as Record<string, unknown>);
  const hasLabel =
    typeof folded.label === "string" || typeof folded.name === "string";
  return (
    hasLabel &&
    folded.score !== undefined &&
    !("summary" in folded) &&
    !("metrics" in folded)
  );
}

function isReviewObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const folded = foldedRecord(record);
  if ("score" in folded && "summary" in folded) return true;
  if ("metrics" in folded) return true;
  const known = CANONICAL_METRICS.filter(
    (label) => label in record || label.toLowerCase() in folded,
  );
  return known.length >= 2;
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
  if (typeof partial?.score !== "number") return undefined;
  return {
    score: partial.score,
    summary: partial.summary ?? "",
    rationale: partial.rationale ?? "",
    metrics: partial.metrics ?? [],
    findings: partial.findings ?? [],
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
      if (!isLoneMetricObject(parsed.value)) fallback = parsed.value;
    }
    index = parsed.end;
  }

  if (fallback !== undefined) return fallback;
  const partial = payloadFromPartial(stripped) ?? payloadFromPartial(text);
  if (partial) return partial;
  throw new Error("TinySwallow returned invalid JSON.");
}

const METRIC_SECTION =
  /^[ \t]*[-*][ \t]+\*\*(?<label>[^*]+?)(?:[ \t]*\((?<score>[^)]+)\))?:?\*\*:?[ \t]*(?<body>.*?)(?=^[ \t]*[-*][ \t]+\*\*|(?![\s\S])|^[ \t]*\*\*[A-Za-z])/gms;

const JSON_METRIC_OBJECT =
  /"label"\s*:\s*"(?<label>Correctness|Security|Maintainability)"\s*,\s*"score"\s*:\s*(?<score>-?\d+(?:\.\d+)?)(?:\s*,\s*"description"\s*:\s*"(?<description>(?:\\.|[^"\\])*)"?)?/gis;

const JSON_NAMED_SCORE =
  /"(?<label>Correctness|Security|Maintainability)"\s*:\s*(?<score>-?\d+(?:\.\d+)?)/gi;

const RATIONALE_BLOCK =
  /\*\*Rationale:\*\*\s*([\s\S]+?)(?=\*\*Relevant Code Snippets:\*\*|$)/i;

const CODE_FENCE = /```(?<lang>[^\n`]*)\n(?<body>[\s\S]*?)```/g;

const SKIP_METRIC_KEYS = new Set([
  "score",
  "summary",
  "rationale",
  "reason",
  "metrics",
  "findings",
  "issues",
]);

const KNOWN_UNSCORED_LABELS = new Set(
  [...CANONICAL_METRICS, "Reliability", "Performance"].map((label) =>
    label.toLowerCase(),
  ),
);

const UNSCORED_METRIC_SCORE = Math.floor(
  (APP_CONFIG.score.min + APP_CONFIG.score.max) / 2,
);

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function plainLines(body: string, separator = " "): string {
  return body
    .split("\n")
    .map((line) => line.replace(/^[ \t]*[-*][ \t]+/, "").replaceAll("**", "").trim())
    .filter(Boolean)
    .join(separator);
}

function joinDescriptionParts(value: unknown): string {
  if (typeof value === "string") {
    const stripped = value.trim();
    return stripped && coerceNumber(value) === undefined ? stripped : "";
  }
  if (!Array.isArray(value)) return "";
  return value.map(joinDescriptionParts).filter(Boolean).join("\n");
}

function metricsFromNamedLists(parsed: Record<string, unknown>) {
  return Object.entries(parsed).flatMap(([key, item]) => {
    if (SKIP_METRIC_KEYS.has(key.toLowerCase()) || !Array.isArray(item)) {
      return [];
    }
    const label = canonicalMetricLabel(key);
    if (!KNOWN_UNSCORED_LABELS.has(label.toLowerCase())) return [];
    const description = joinDescriptionParts(item);
    if (!description) return [];
    const metric = readReviewMetric({
      label,
      score: UNSCORED_METRIC_SCORE,
      description,
    });
    return metric ? [metric] : [];
  });
}

function metricsFromMarkdown(text: string) {
  return [...text.matchAll(METRIC_SECTION)].flatMap((match) => {
    const label = canonicalMetricLabel(
      (match.groups?.label ?? "").replace(/\s*\([^)]*\)\s*$/, "").replace(/[:\s]+$/, ""),
    );
    if (!label) return [];
    const description = plainLines(match.groups?.body ?? "", "\n");
    const metric = readReviewMetric({
      label,
      score: match.groups?.score,
      description,
    });
    if (metric) return [metric];
    if (!description || !KNOWN_UNSCORED_LABELS.has(label.toLowerCase())) {
      return [];
    }
    const fallback = readReviewMetric({
      label,
      score: UNSCORED_METRIC_SCORE,
      description,
    });
    return fallback ? [fallback] : [];
  });
}

function metricsFromJsonText(text: string) {
  const fromObjects = [...text.matchAll(JSON_METRIC_OBJECT)].flatMap((match) => {
    const description = match.groups?.description
      ? unescapeJsonString(match.groups.description).trim()
      : undefined;
    const metric = readReviewMetric({
      label: match.groups?.label,
      score: match.groups?.score,
      description,
    });
    return metric ? [metric] : [];
  });
  const fromNames = [...text.matchAll(JSON_NAMED_SCORE)].flatMap((match) => {
    const metric = readReviewMetric({
      label: match.groups?.label,
      score: match.groups?.score,
    });
    return metric ? [metric] : [];
  });
  return [...fromObjects, ...fromNames];
}

function textForMetricSections(
  parsed: Record<string, unknown>,
  text: string,
): string {
  const parts = [text];
  for (const key of ["summary", "rationale", "reason"] as const) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) parts.push(value);
  }
  if (Array.isArray(parsed.metrics)) {
    for (const item of parsed.metrics) {
      if (item && typeof item === "object" && "description" in item) {
        const description = (item as { description?: unknown }).description;
        if (typeof description === "string") parts.push(description);
      }
    }
  }
  return parts.join("\n");
}

function recoverMetrics(parsed: Record<string, unknown>, text: string) {
  return collectMetrics([
    ...(Array.isArray(parsed.metrics) ? parsed.metrics : []),
    ...metricsFromNamedLists(parsed),
    ...metricsFromMarkdown(textForMetricSections(parsed, text)),
    ...metricsFromJsonText(text),
  ]);
}

function snippetsFromText(text: string) {
  return [...text.matchAll(CODE_FENCE)].flatMap((match) => {
    const language = (match.groups?.lang ?? "").trim().toLowerCase();
    if (language === "json" || language === "jsonc") return [];
    const body = (match.groups?.body ?? "").trim();
    return body ? [body] : [];
  });
}

function attachSnippets(
  metrics: Array<{
    label: string;
    score: number;
    description?: string;
    snippet?: string;
  }>,
  text: string,
) {
  const snippets = snippetsFromText(text);
  if (!snippets.length) return metrics;
  const next = metrics.map((metric) => ({ ...metric }));
  const joined = snippets.join("\n").toLowerCase();
  let target = next.reduce((weakest, metric) =>
    metric.score < weakest.score ? metric : weakest,
  );
  if (joined.includes("security")) {
    const security = next.find((metric) => metric.label === "Security");
    if (security) target = security;
  }
  if (!target.snippet) target.snippet = snippets[0];
  return next;
}

export function parseReviewOutput(text: string): Record<string, unknown> {
  const parsed = parseReviewJson(text);
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  const coerced =
    coerceReviewPayload(parsed) ?? coerceReviewPayload(payloadFromPartial(text));
  const source = { ...(record ?? {}), ...(coerced ?? {}) };
  const metrics = recoverMetrics(source, text);
  if (!metrics.length) {
    if (coerced) return coerced;
    throw new Error("TinySwallow returned invalid JSON.");
  }
  const score =
    typeof coerced?.score === "number"
      ? coerced.score
      : metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length;
  const summary =
    typeof source.summary === "string" && source.summary.trim()
      ? source.summary
      : `${metrics.map((metric) => `${metric.label} ${clampScore(metric.score)}`).join(", ")}.`;
  const rationaleMatch = text.match(RATIONALE_BLOCK);
  const rationaleFromMarkdown = rationaleMatch
    ? plainLines(rationaleMatch[1] ?? "")
    : "";
  const rationale =
    typeof source.rationale === "string" && source.rationale.trim()
      ? source.rationale
      : rationaleFromMarkdown ||
        metrics
          .map(
            (metric) =>
              `${metric.label} (${clampScore(metric.score)}): ${metric.description ?? ""}`.trim(),
          )
          .join(" ");
  return {
    ...source,
    score: clampScore(score),
    summary,
    rationale,
    metrics: attachSnippets(metrics, text),
    findings: Array.isArray(source.findings) ? source.findings : [],
  };
}
