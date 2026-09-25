import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewSessionProvider } from "../src/context/ReviewSessionContext";
import { SessionProvider, useSession } from "../src/context/SessionContext";
import { useReviewSession } from "../src/context/ReviewSessionContext";
import { ToastProvider } from "../src/context/ToastContext";
import { LocaleProvider } from "../src/i18n/locale";
import { AccountPage } from "../src/pages/AccountPage";
import { DashboardPage } from "../src/pages/DashboardPage";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("../src/services/auth", () => ({
  getSession,
  logout: vi.fn(),
}));

vi.mock("../src/services/history", () => ({
  listHistory: vi.fn().mockResolvedValue([]),
  getHistoryEntry: vi.fn(),
  saveHistory: vi.fn(),
  deleteHistory: vi.fn(),
  starHistory: vi.fn(),
  sortHistorySummaries: (entries: unknown[]) => entries,
  toHistorySummary: vi.fn(),
}));

vi.mock("../src/services/reviewCloud", () => ({
  listInferenceProviders: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/services/review", () => ({
  preloadBrowserModel: vi.fn().mockResolvedValue({}),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <ToastProvider>
        <SessionProvider>
          <ReviewSessionProvider>{children}</ReviewSessionProvider>
        </SessionProvider>
      </ToastProvider>
    </LocaleProvider>
  );
}

describe("account and dashboard pages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing on the account page without a session", async () => {
    getSession.mockResolvedValue(null);
    const { container } = render(
      <Providers>
        <MemoryRouter>
          <AccountPage />
        </MemoryRouter>
      </Providers>,
    );
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(container.querySelector(".account-view")).toBeNull();
  });

  it("renders nothing on the dashboard without a session", async () => {
    getSession.mockResolvedValue(null);
    const { container } = render(
      <Providers>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Providers>,
    );
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(container.querySelector(".dashboard-view")).toBeNull();
  });
});

describe("session hooks", () => {
  it("throws when useSession is used outside a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useSession();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(
      "useSession must be used within SessionProvider.",
    );
    error.mockRestore();
  });

  it("throws when useReviewSession is used outside a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useReviewSession();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(
      "useReviewSession must be used within ReviewSessionProvider.",
    );
    error.mockRestore();
  });
});
