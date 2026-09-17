import type { User } from "../src/services/auth";
import { toHistorySummary } from "../src/services/history";
import type {
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
  details: { language: "polite" },
};

export const reviewResult: ReviewResult = {
  translation: "よろしくお願いします。",
  lesson:
    "For polite register, よろしくお願いします is the natural closing when asking for someone's consideration.",
  durationMs: 1500,
  inference: {
    provider: "browser",
    modelId: "test-model",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    systemPrompt: "system",
    userPrompt: "user",
    responseSchema: { type: "object" },
    generationConfig: { temperature: 0.2, maxTokens: 256 },
    finishReason: "stop",
    rawOutput: "{}",
    logs: [logEntry],
  },
};

export const historyEntry: ReviewHistoryEntry = {
  id: "8f4cb94c-3396-4d33-9582-b16dcb884ec6",
  language: "polite",
  code: "pass",
  createdAt: "2026-01-01T00:00:00.000Z",
  starred: false,
  result: reviewResult,
};

export const historySummary = toHistorySummary(historyEntry);
