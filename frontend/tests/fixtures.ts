import type { User } from "../src/services/auth";
import { toHistorySummary } from "../src/services/history";
import type {
  InferenceProviderInfo,
  ReviewHistoryEntry,
  ReviewLogEntry,
  ReviewResult,
} from "../src/types/review";

export const user: User = {
  id: "user-id",
  name: "M",
  email: "m@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const logEntry: ReviewLogEntry = {
  id: "log-1",
  timestamp: "2026-01-01T00:00:00.000Z",
  level: "info",
  stage: "review",
  message: "Starting review",
  details: { language: "python" },
};

export const reviewResult: ReviewResult = {
  score: 88,
  summary: "Solid work",
  rationale: "The function returns a value.",
  durationMs: 1500,
  metrics: [
    {
      label: "Correctness",
      score: 90,
      description: "Behavior is sound.",
      snippet: "return result",
    },
    { label: "Security", score: 80 },
    { label: "UnknownMetric", score: 70 },
  ],
  findings: [
    {
      id: "f1",
      severity: "critical",
      title: "Null crash",
      description: "Missing a guard.",
      line: 4,
      suggestion: "Handle null",
    },
    {
      id: "f2",
      severity: "warning",
      title: "Unchecked input",
      description: "Trusts the caller.",
      line: 8,
    },
    {
      id: "f3",
      severity: "suggestion",
      title: "Rename helper",
      description: "The name is vague.",
      line: 2,
    },
  ],
  inference: {
    provider: "browser",
    modelId: "test-model",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    systemPrompt: "system",
    userPrompt: "user",
    responseSchema: { type: "object" },
    generationConfig: { temperature: 0.2, maxTokens: 256, maxFindings: 3 },
    finishReason: "stop",
    rawOutput: "{}",
    logs: [logEntry],
  },
};

export const historyEntry: ReviewHistoryEntry = {
  id: "8f4cb94c-3396-4d33-9582-b16dcb884ec6",
  language: "python",
  code: "pass",
  createdAt: "2026-01-01T00:00:00.000Z",
  starred: false,
  result: reviewResult,
};

export const historySummary = toHistorySummary(historyEntry);

export const huggingfaceProvider: InferenceProviderInfo = {
  id: "huggingface",
  label: "Hugging Face Cloud",
  modelId: "TinySwallow-1.5B-Instruct",
  description: "Runs through Hugging Face Inference Providers.",
  temperature: 0.2,
  maxCodeCharacters: 4000,
  maxTokens: 512,
  maxFindings: 3,
  timeoutMs: 55000,
  requestsPerWindow: 10,
  rateLimitWindowMinutes: 60,
};

export const modalProvider: InferenceProviderInfo = {
  id: "modal",
  label: "Modal GPU Cloud",
  modelId: "cloud-model",
  description: "Runs on a dedicated Modal GPU.",
  temperature: 0.1,
  maxCodeCharacters: 4000,
  maxTokens: 384,
  maxFindings: 2,
  timeoutMs: 55000,
  requestsPerWindow: 10,
  rateLimitWindowMinutes: 60,
};
