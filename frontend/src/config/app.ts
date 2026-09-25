import { numberFromEnv, stringFromEnv } from "./env";

export const APP_CONFIG = {
  api: {
    prefix: stringFromEnv(import.meta.env.VITE_API_PREFIX, "/api"),
    auth: stringFromEnv(import.meta.env.VITE_API_AUTH_PATH, "/api/auth"),
    review: stringFromEnv(import.meta.env.VITE_API_REVIEW_PATH, "/api/review"),
    history: stringFromEnv(import.meta.env.VITE_API_HISTORY_PATH, "/api/history"),
  },
  auth: {
    nameMinLength: numberFromEnv(
      import.meta.env.VITE_AUTH_NAME_MIN_LENGTH,
      2,
      1,
    ),
    nameMaxLength: numberFromEnv(
      import.meta.env.VITE_AUTH_NAME_MAX_LENGTH,
      80,
      1,
    ),
    emailMaxLength: numberFromEnv(
      import.meta.env.VITE_AUTH_EMAIL_MAX_LENGTH,
      254,
      1,
    ),
    passwordMinLength: numberFromEnv(
      import.meta.env.VITE_AUTH_PASSWORD_MIN_LENGTH,
      8,
      1,
    ),
    passwordMaxLength: numberFromEnv(
      import.meta.env.VITE_AUTH_PASSWORD_MAX_LENGTH,
      128,
      1,
    ),
  },
  retention: {
    historyDays: numberFromEnv(
      import.meta.env.VITE_HISTORY_RETENTION_DAYS,
      90,
      1,
    ),
    inferenceRequestsDays: numberFromEnv(
      import.meta.env.VITE_INFERENCE_REQUESTS_RETENTION_DAYS,
      30,
      1,
    ),
  },
  score: {
    min: numberFromEnv(import.meta.env.VITE_SCORE_MIN, 0, 0),
    max: numberFromEnv(import.meta.env.VITE_SCORE_MAX, 100, 1),
    maxMetrics: numberFromEnv(import.meta.env.VITE_SCORE_MAX_METRICS, 3, 1),
    bands: {
      strong: numberFromEnv(import.meta.env.VITE_SCORE_BAND_STRONG, 90, 0),
      good: numberFromEnv(import.meta.env.VITE_SCORE_BAND_GOOD, 75, 0),
      fair: numberFromEnv(import.meta.env.VITE_SCORE_BAND_FAIR, 50, 0),
      poor: numberFromEnv(import.meta.env.VITE_SCORE_BAND_POOR, 25, 0),
    },
  },
  ui: {
    toastDurationMs: numberFromEnv(
      import.meta.env.VITE_TOAST_DURATION_MS,
      4500,
      1,
    ),
    toastLimit: numberFromEnv(import.meta.env.VITE_TOAST_LIMIT, 4, 1),
    modelLogLimit: numberFromEnv(import.meta.env.VITE_MODEL_LOG_LIMIT, 500, 1),
    statusTickMs: numberFromEnv(import.meta.env.VITE_STATUS_TICK_MS, 500, 1),
    elapsedWholeSecondsAt: numberFromEnv(
      import.meta.env.VITE_ELAPSED_WHOLE_SECONDS_AT,
      10,
      1,
    ),
    copyFeedbackMs: numberFromEnv(
      import.meta.env.VITE_COPY_FEEDBACK_MS,
      1500,
      1,
    ),
    activityLogLimit: numberFromEnv(
      import.meta.env.VITE_ACTIVITY_LOG_LIMIT,
      6,
      1,
    ),
    streamStickinessPx: numberFromEnv(
      import.meta.env.VITE_STREAM_STICKINESS_PX,
      40,
      1,
    ),
  },
  locale: {
    storageKey: stringFromEnv(
      import.meta.env.VITE_LOCALE_STORAGE_KEY,
      "ai-locale",
    ),
  },
  links: {
    tinyswallowPaper: stringFromEnv(
      import.meta.env.VITE_TINYSWALLOW_PAPER_URL,
      "https://arxiv.org/pdf/2501.16937",
    ),
  },
  export: {
    filename: stringFromEnv(
      import.meta.env.VITE_ACCOUNT_EXPORT_FILENAME,
      "ai-account-export.json",
    ),
  },
} as const;


export function formatElapsedSeconds(value: number): string {
  return value >= APP_CONFIG.ui.elapsedWholeSecondsAt
    ? value.toFixed(0)
    : value.toFixed(1);
}

export function clampScore(value: number): number {
  return Math.round(
    Math.max(APP_CONFIG.score.min, Math.min(value, APP_CONFIG.score.max)),
  );
}
