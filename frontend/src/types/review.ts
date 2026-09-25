export const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "go",
  "rust",
  "cpp",
] as const;

export type Language = (typeof LANGUAGES)[number];

export type Severity = "critical" | "warning" | "suggestion";

const CLOUD_INFERENCE_PROVIDERS = [
  "modal",
  "huggingface",
  "custom",
] as const;

export type CloudInferenceProvider = (typeof CLOUD_INFERENCE_PROVIDERS)[number];
export type InferenceProvider = "browser" | CloudInferenceProvider;

export function isCloudInferenceProvider(
  value: string,
): value is CloudInferenceProvider {
  return (CLOUD_INFERENCE_PROVIDERS as readonly string[]).includes(value);
}

export function isInferenceProvider(value: string): value is InferenceProvider {
  return value === "browser" || isCloudInferenceProvider(value);
}

export interface ReviewParameters {
  temperature: number;
  maxTokens: number;
  maxFindings: number;
}

export interface InferenceProviderInfo {
  id: CloudInferenceProvider;
  label: string;
  modelId: string;
  description: string;
  temperature: number;
  maxCodeCharacters: number;
  maxTokens: number;
  maxFindings: number;
  timeoutMs: number;
  requestsPerWindow: number;
  rateLimitWindowMinutes: number;
}

export interface ReviewFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  line: number;
  suggestion?: string;
}

interface ReviewMetric {
  label: string;
  score: number;
  description?: string;
  snippet?: string;
}

export type ReviewLogLevel = "debug" | "info" | "warning" | "error";

export interface ReviewLogEntry {
  id: string;
  timestamp: string;
  level: ReviewLogLevel;
  stage: string;
  message: string;
  details?: unknown;
}

export interface ReviewInferenceTrace {
  provider: InferenceProvider;
  modelId: string;
  startedAt: string;
  completedAt: string;
  systemPrompt: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  generationConfig: {
    temperature: number;
    maxTokens: number;
    maxFindings?: number;
  };
  finishReason: string | null;
  usage?: unknown;
  runtimeStats?: string;
  rawOutput: string;
  logs: ReviewLogEntry[];
}

export interface ReviewResult {
  score: number;
  summary: string;
  rationale?: string;
  findings: ReviewFinding[];
  metrics: ReviewMetric[];
  durationMs: number;
  inference?: ReviewInferenceTrace;
  partial?: boolean;
}

export interface ReviewRequest {
  code: string;
  language: Language;
}

export interface ReviewRunRequest extends ReviewRequest {
  parameters: ReviewParameters;
  resumeFrom?: string;
  resumeElapsedMs?: number;
}

export interface CloudReviewRequest extends ReviewRunRequest {
  provider: CloudInferenceProvider;
}

export interface ReviewHistoryEntry extends ReviewRequest {
  id: string;
  result: ReviewResult;
  createdAt: string;
  starred: boolean;
}

export interface ReviewHistorySummary {
  id: string;
  language: Language;
  createdAt: string;
  codePreview: string;
  lineCount?: number;
  characterCount?: number;
  score: number;
  summary: string;
  starred: boolean;
  provider?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  maxFindings?: number;
  durationMs?: number;
}
