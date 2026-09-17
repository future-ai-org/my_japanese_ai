export const LANGUAGES = ["casual", "polite", "formal"] as const;

export type Language = (typeof LANGUAGES)[number];

export type InferenceProvider = "browser";

export function isInferenceProvider(value: string): value is InferenceProvider {
  return value === "browser";
}

export interface ReviewParameters {
  temperature: number;
  maxTokens: number;
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
  };
  finishReason: string | null;
  usage?: unknown;
  runtimeStats?: string;
  rawOutput: string;
  logs: ReviewLogEntry[];
}

export interface ReviewResult {
  translation: string;
  lesson: string;
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
  translation: string;
  starred: boolean;
  provider?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  durationMs?: number;
}
