import { afterEach, describe, expect, it, vi } from "vitest";

describe("APP_CONFIG", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses documented browser defaults", async () => {
    const { APP_CONFIG, formatElapsedSeconds } = await import(
      "../src/config/app"
    );

    expect(APP_CONFIG.auth).toEqual({
      nameMinLength: 2,
      nameMaxLength: 80,
      emailMaxLength: 254,
      passwordMinLength: 8,
      passwordMaxLength: 128,
    });
    expect(APP_CONFIG.api).toEqual({
      auth: "/api/auth",
      history: "/api/history",
    });
    expect(APP_CONFIG.retention).toEqual({
      historyDays: 90,
    });
    expect(APP_CONFIG.ui.toastDurationMs).toBe(4500);
    expect(formatElapsedSeconds(9.4)).toBe("9.4");
    expect(formatElapsedSeconds(12.2)).toBe("12");
  });

  it("reads auth and UI overrides from env", async () => {
    vi.stubEnv("VITE_AUTH_PASSWORD_MIN_LENGTH", "12");
    vi.stubEnv("VITE_HISTORY_RETENTION_DAYS", "14");
    vi.stubEnv("VITE_TOAST_LIMIT", "2");
    vi.resetModules();

    const { APP_CONFIG } = await import("../src/config/app");
    expect(APP_CONFIG.auth.passwordMinLength).toBe(12);
    expect(APP_CONFIG.retention.historyDays).toBe(14);
    expect(APP_CONFIG.ui.toastLimit).toBe(2);
  });

  it("ignores invalid numeric and empty string overrides", async () => {
    vi.stubEnv("VITE_AUTH_NAME_MAX_LENGTH", "nope");
    vi.stubEnv("VITE_TOAST_DURATION_MS", "0");
    vi.resetModules();

    const { APP_CONFIG } = await import("../src/config/app");
    expect(APP_CONFIG.auth.nameMaxLength).toBe(80);
    expect(APP_CONFIG.ui.toastDurationMs).toBe(4500);
  });
});
