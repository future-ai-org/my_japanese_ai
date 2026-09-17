import { numberFromEnv, stringFromEnv } from "./env";

export const APP_CONFIG = {
  api: {
    auth: stringFromEnv(import.meta.env.VITE_API_AUTH_PATH, "/api/auth"),
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
  },
  ui: {
    toastDurationMs: numberFromEnv(
      import.meta.env.VITE_TOAST_DURATION_MS,
      4500,
      1,
    ),
    toastLimit: numberFromEnv(import.meta.env.VITE_TOAST_LIMIT, 4, 1),
    statusTickMs: numberFromEnv(import.meta.env.VITE_STATUS_TICK_MS, 500, 1),
    elapsedWholeSecondsAt: numberFromEnv(
      import.meta.env.VITE_ELAPSED_WHOLE_SECONDS_AT,
      10,
      1,
    ),
    streamStickinessPx: numberFromEnv(
      import.meta.env.VITE_STREAM_STICKINESS_PX,
      40,
      1,
    ),
  },
  export: {
    filename: stringFromEnv(
      import.meta.env.VITE_ACCOUNT_EXPORT_FILENAME,
      "japanese-account-export.json",
    ),
  },
} as const;


export function formatElapsedSeconds(value: number): string {
  return value >= APP_CONFIG.ui.elapsedWholeSecondsAt
    ? value.toFixed(0)
    : value.toFixed(1);
}
