import type {
  Language,
  ReviewFinding,
  ReviewInferenceTrace,
  ReviewResult,
  Severity,
} from "../types/review.js";
import { APP_CONFIG, clampScore } from "../config/app";
import { numberFromEnv } from "../config/env";
import reviewSystemPrompt from "../../../backend/app/prompts/review_system.txt?raw";
import reviewUserPrompt from "../../../backend/app/prompts/review_user.txt?raw";
import reviewUserPromptDetailed from "../../../backend/app/prompts/review_user_detailed.txt?raw";

// Medium and standard token budgets ask for 3-4 sentence metric writeups.
// Short stays on the compact template so all three metrics still fit.
export const REVIEW_DETAILED_MIN_TOKENS = numberFromEnv(
  import.meta.env.VITE_REVIEW_DETAILED_MIN_TOKENS,
  numberFromEnv(import.meta.env.VITE_REVIEW_TOKEN_MEDIUM, 384, 1),
  1,
);

const REVIEW_METRIC_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    description: { type: "string" },
    snippet: { type: "string" },
  },
  required: ["score", "description"],
} as const;

const WEBLLM_METRIC_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    description: { type: "string" },
  },
  required: ["score", "description"],
} as const;

const REVIEW_FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    severity: {
      type: "string",
      enum: ["critical", "warning", "suggestion"],
    },
    title: { type: "string" },
    description: { type: "string" },
    line: { type: "integer" },
    suggestion: { type: "string" },
  },
  required: ["severity", "title", "description", "line"],
} as const;

function namedMetricsSchema<T extends Record<string, unknown>>(item: T) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      Correctness: item,
      Security: item,
      Maintainability: item,
    },
    required: ["Correctness", "Security", "Maintainability"],
  } as const;
}

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    metrics: namedMetricsSchema(REVIEW_METRIC_OBJECT_SCHEMA),
    summary: { type: "string" },
    rationale: { type: "string" },
    findings: {
      type: "array",
      items: REVIEW_FINDING_SCHEMA,
    },
  },
  required: ["score", "metrics", "summary", "rationale", "findings"],
} as const;

// Compact grammar for WebLLM: required named metrics, no snippets, no
// minItems/minimum keywords that older xgrammar builds warn on.
export const WEBLLM_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    metrics: namedMetricsSchema(WEBLLM_METRIC_OBJECT_SCHEMA),
    summary: { type: "string" },
    rationale: { type: "string" },
    findings: {
      type: "array",
      items: REVIEW_FINDING_SCHEMA,
    },
  },
  required: ["score", "metrics", "summary", "rationale", "findings"],
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

const SEVERITY_ALIASES: Record<string, Severity> = {
  critical: "critical",
  error: "critical",
  fatal: "critical",
  high: "critical",
  warning: "warning",
  warn: "warning",
  medium: "warning",
  moderate: "warning",
  suggestion: "suggestion",
  info: "suggestion",
  information: "suggestion",
  note: "suggestion",
  low: "suggestion",
  nit: "suggestion",
};

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

function readSeverity(value: unknown): Severity | undefined {
  if (typeof value !== "string") return undefined;
  return SEVERITY_ALIASES[value.trim().toLowerCase()];
}

function clampLine(line: number, lineCount: number): number {
  return Math.max(1, Math.min(Math.round(line), Math.max(1, lineCount)));
}

export const CANONICAL_METRICS = [
  "Correctness",
  "Security",
  "Maintainability",
] as const;

const KNOWN_METRIC_LABELS = new Set(
  [...CANONICAL_METRICS, "Reliability", "Performance"].map((label) =>
    label.toLowerCase(),
  ),
);

const SKIP_METRIC_KEYS = new Set([
  "score",
  "summary",
  "rationale",
  "reason",
  "metrics",
  "findings",
  "issues",
]);

export function canonicalMetricLabel(label: string): string {
  const stripped = label.trim();
  const match = CANONICAL_METRICS.find(
    (canonical) => canonical.toLowerCase() === stripped.toLowerCase(),
  );
  return match ?? stripped;
}

function metricPayload(
  label: unknown,
  score: unknown,
  description?: unknown,
  snippet?: unknown,
) {
  if (typeof label !== "string" || !label.trim()) return undefined;
  const number = coerceNumber(score);
  if (number === undefined) return undefined;
  return {
    label: canonicalMetricLabel(label),
    score: number,
    description:
      typeof description === "string" && description.trim()
        ? description.trim()
        : undefined,
    snippet: typeof snippet === "string" ? snippet : undefined,
  };
}

function metricFromNamedEntry(key: string, value: unknown) {
  if (SKIP_METRIC_KEYS.has(key.toLowerCase())) return undefined;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const folded = foldKeys(value as Record<string, unknown>);
    return (
      metricPayload(
        typeof folded.label === "string"
          ? folded.label
          : typeof folded.name === "string"
            ? folded.name
            : key,
        folded.score,
        folded.description,
        folded.snippet,
      ) ?? metricPayload(key, folded.score, folded.description, folded.snippet)
    );
  }
  if (typeof value === "string" && coerceNumber(value) === undefined) {
    return undefined;
  }
  return metricPayload(key, value);
}

function orderMetrics(
  metrics: Array<{
    label: string;
    score: number;
    description?: string;
    snippet?: string;
  }>,
) {
  const merged = new Map<
    string,
    { label: string; score: number; description?: string; snippet?: string }
  >();
  const extras: Array<{
    label: string;
    score: number;
    description?: string;
    snippet?: string;
  }> = [];
  for (const metric of metrics) {
    const label = canonicalMetricLabel(metric.label);
    const key = label.toLowerCase();
    const current = { ...metric, label };
    if (KNOWN_METRIC_LABELS.has(key)) {
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, current);
      } else {
        if (!existing.description && current.description) {
          existing.description = current.description;
        }
        if (!existing.snippet && current.snippet) {
          existing.snippet = current.snippet;
        }
      }
    } else {
      extras.push(current);
    }
  }
  const ordered = CANONICAL_METRICS.flatMap((label) => {
    const item = merged.get(label.toLowerCase());
    return item ? [item] : [];
  });
  for (const item of merged.values()) {
    if (!ordered.includes(item)) ordered.push(item);
  }
  ordered.push(...extras);
  return ordered.slice(0, APP_CONFIG.score.maxMetrics);
}

export function collectMetrics(value: unknown) {
  const metrics: Array<{
    label: string;
    score: number;
    description?: string;
    snippet?: string;
  }> = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const metric = readReviewMetric(item);
      if (metric) {
        metrics.push(metric);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
        const extra = metricFromNamedEntry(key, nested);
        if (extra) metrics.push(extra);
      }
    }
    return orderMetrics(metrics);
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const known = Object.keys(record).filter((key) =>
    KNOWN_METRIC_LABELS.has(canonicalMetricLabel(key).toLowerCase()),
  );
  const single = readReviewMetric(record);
  if (known.length >= 2 || (!single && known.length)) {
    for (const [key, item] of Object.entries(record)) {
      const extra = metricFromNamedEntry(key, item);
      if (extra) metrics.push(extra);
    }
    return orderMetrics(metrics);
  }
  return single ? [single] : [];
}

export function readReviewMetric(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const item = foldKeys(value as Record<string, unknown>);
  const fromFields = metricPayload(
    item.label ?? item.name,
    item.score,
    item.description,
    item.snippet,
  );
  if (fromFields) {
    return {
      ...fromFields,
      score: clampScore(fromFields.score),
    };
  }
  const named: Array<{
    label: string;
    score: number;
    description?: string;
    snippet?: string;
  }> = [];
  const sharedDescription =
    typeof item.description === "string" ? item.description : undefined;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const extra = metricFromNamedEntry(key, nested);
    if (!extra) continue;
    if (sharedDescription && !extra.description) {
      extra.description = sharedDescription;
    }
    named.push({ ...extra, score: clampScore(extra.score) });
  }
  return named.length === 1 ? named[0] : undefined;
}

export function readReviewFinding(
  value: unknown,
  index: number,
  options: { lineCount: number; createId: () => string },
): ReviewFinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = foldKeys(value as Record<string, unknown>);
  const severity = readSeverity(item.severity);
  const title = item.title ?? item.name;
  const description = item.description ?? item.message;
  const line = coerceNumber(item.line ?? item.lineno) ?? 1;
  if (
    !severity ||
    typeof title !== "string" ||
    !title ||
    typeof description !== "string"
  ) {
    return undefined;
  }
  return {
    id: `review-${index}-${options.createId()}`,
    severity,
    title,
    description,
    line: clampLine(line, options.lineCount),
    suggestion:
      typeof item.suggestion === "string" && item.suggestion
        ? item.suggestion
        : undefined,
  };
}

export function coerceReviewPayload(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const folded = foldKeys(record);
  const collected = [
    ...collectMetrics(folded.metrics),
    ...CANONICAL_METRICS.flatMap((label) => {
      const extra = metricFromNamedEntry(label, record[label] ?? folded[label.toLowerCase()]);
      return extra ? [{ ...extra, score: clampScore(extra.score) }] : [];
    }),
  ];
  const metrics = orderMetrics(collected);
  const parsedScore = coerceNumber(folded.score);
  const score =
    parsedScore ??
    (!("score" in folded) && metrics.length
      ? metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length
      : undefined);
  if (score === undefined) return undefined;
  return {
    score,
    summary: coerceText(folded.summary),
    rationale: coerceText(folded.rationale ?? folded.reason),
    metrics,
    findings: Array.isArray(folded.findings ?? folded.issues)
      ? (folded.findings ?? folded.issues)
      : [],
  };
}

export function normalizeReviewResult(
  value: unknown,
  options: {
    lineCount: number;
    durationMs: number;
    maxFindings: number;
    inference: ReviewInferenceTrace;
    createId: () => string;
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

  const metrics = (candidate.metrics as unknown[])
    .flatMap((metric) => {
      const item = readReviewMetric(metric);
      return item ? [item] : [];
    })
    .slice(0, APP_CONFIG.score.maxMetrics);

  const findings = (candidate.findings as unknown[])
    .flatMap((finding, index) => {
      const item = readReviewFinding(finding, index, options);
      return item ? [item] : [];
    })
    .slice(0, options.maxFindings);

  return {
    score: clampScore(candidate.score as number),
    summary: candidate.summary as string,
    rationale: candidate.rationale as string,
    metrics,
    findings,
    durationMs: options.durationMs,
    inference: options.inference,
  };
}
