import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { REVIEW_CONFIG } from "../src/config/review";
import { EXAMPLES } from "../src/data/examples";
import { ReviewInterruptedError } from "../src/review/resume";
import type { Language } from "../src/types/review";
import { historyEntry, historySummary, huggingfaceProvider, modalProvider, reviewResult, user } from "./fixtures";

const {
  defaultProvider,
  getSession,
  logout,
  login,
  register,
  deleteAccount,
  listHistory,
  getHistoryEntry,
  saveHistory,
  deleteHistory,
  starHistory,
  listInferenceProviders,
  runReview,
  preloadBrowserModel,
} = vi.hoisted(() => ({
  defaultProvider: { current: "browser" as "browser" | "modal" | "huggingface" | "custom" },
  getSession: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  deleteAccount: vi.fn(),
  listHistory: vi.fn(),
  getHistoryEntry: vi.fn(),
  saveHistory: vi.fn(),
  deleteHistory: vi.fn(),
  starHistory: vi.fn(),
  listInferenceProviders: vi.fn(),
  runReview: vi.fn(),
  preloadBrowserModel: vi.fn(),
}));

vi.mock("../src/config/review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/review")>();
  return {
    ...actual,
    REVIEW_CONFIG: {
      ...actual.REVIEW_CONFIG,
      get defaultProvider() {
        return defaultProvider.current;
      },
    },
  };
});

vi.mock("../src/services/auth", () => ({
  getSession,
  logout,
  login,
  register,
  exportAccount: vi.fn(),
  deleteAccount,
}));

vi.mock("../src/services/history", () => ({
  listHistory,
  getHistoryEntry,
  saveHistory,
  deleteHistory,
  starHistory,
  sortHistorySummaries: (
    entries: Array<{ starred?: boolean; createdAt: string }>,
  ) =>
    [...entries].sort((left, right) => {
      if (Boolean(left.starred) !== Boolean(right.starred)) {
        return left.starred ? -1 : 1;
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    }),
  toHistorySummary: (entry: typeof historyEntry) => ({
    id: entry.id,
    language: entry.language,
    createdAt: entry.createdAt,
    codePreview: entry.code.split("\n")[0] ?? "",
    lineCount: entry.code ? entry.code.split("\n").length : 0,
    characterCount: entry.code.length,
    score: entry.result.score,
    summary: entry.result.summary,
    starred: Boolean(entry.starred),
    provider: entry.result.inference?.provider,
    modelId: entry.result.inference?.modelId,
    temperature: entry.result.inference?.generationConfig.temperature,
    maxTokens: entry.result.inference?.generationConfig.maxTokens,
    maxFindings: entry.result.inference?.generationConfig.maxFindings,
    durationMs: entry.result.durationMs,
  }),
}));

vi.mock("../src/services/reviewCloud", () => ({
  listInferenceProviders,
}));

vi.mock("../src/services/reviewRunner", () => ({
  runReview,
}));

vi.mock("../src/services/review", () => ({
  preloadBrowserModel,
}));

vi.mock("@codemirror/lang-cpp", () => ({
  cpp: () => [],
}));

vi.mock("@codemirror/lang-go", () => ({
  go: () => [],
}));

vi.mock("@codemirror/lang-javascript", () => ({
  javascript: () => [],
}));

vi.mock("@codemirror/lang-python", () => ({
  python: () => [],
}));

vi.mock("@codemirror/lang-rust", () => ({
  rust: () => [],
}));

vi.mock("@codemirror/view", () => ({
  EditorView: {
    scrollIntoView: vi.fn(() => ({})),
  },
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    onCreateEditor,
  }: {
    value: string;
    onChange: (value: string) => void;
    onCreateEditor?: (view: {
      state: { doc: { lines: number; line: (n: number) => { from: number } } };
      dispatch: () => void;
      focus: () => void;
    }) => void;
  }) => {
    onCreateEditor?.({
      state: {
        doc: {
          lines: Math.max(value.split("\n").length, 1),
          line: (n: number) => ({ from: Math.max(0, n - 1) }),
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    });
    return (
      <textarea
        aria-label="Code to review"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  },
}));

async function renderApp(path = "/") {
  const view = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByLabelText("Primary navigation");
  return view;
}

function chooseTinyModel() {
  fireEvent.change(screen.getByLabelText("Review model"), {
    target: { value: REVIEW_CONFIG.defaultModelId },
  });
}

function chooseCloudModel(modelId = modalProvider.modelId) {
  fireEvent.change(screen.getByLabelText("Review model"), {
    target: { value: modelId },
  });
}

function loadExample(language: Language = "python") {
  const select = screen.getByLabelText("Load an example") as HTMLSelectElement;
  if (select.value === language) {
    const other = language === "python" ? "go" : "python";
    fireEvent.change(select, { target: { value: other } });
  }
  fireEvent.change(select, { target: { value: language } });
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProvider.current = "browser";
    getSession.mockResolvedValue(null);
    logout.mockResolvedValue(undefined);
    login.mockResolvedValue(user);
    register.mockResolvedValue(user);
    deleteAccount.mockResolvedValue(undefined);
    listHistory.mockResolvedValue([]);
    getHistoryEntry.mockResolvedValue(historyEntry);
    saveHistory.mockResolvedValue(historyEntry);
    deleteHistory.mockResolvedValue(undefined);
    starHistory.mockResolvedValue({ ...historySummary, starred: true });
    listInferenceProviders.mockResolvedValue([]);
    runReview.mockResolvedValue(reviewResult);
    preloadBrowserModel.mockResolvedValue({});
    window.history.replaceState(null, "", "/");
  });

  it("loads a session failure as signed out and opens auth views", async () => {
    getSession.mockRejectedValue(new Error("offline"));
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Sign up" }));
    expect(
      screen.getByRole("heading", { name: "Create an account" }),
    ).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Go to home" }));
    expect(
      screen.getByRole("heading", { name: /Review your code/ }),
    ).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Sign in" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("hides dashboard while signed out", async () => {
    await renderApp();
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("links TAID to the documentation page", async () => {
    await renderApp();
    const taid = screen.getByRole("link", { name: "TAID" });
    expect(taid).toHaveAttribute("href", "/docs/taid");
  });

  it("shows the idle results prompt before any code is reviewed", async () => {
    await renderApp();
    const heading = screen.getByRole("heading", { name: "Ready when you are" });
    expect(heading.closest(".empty-state")).toBeTruthy();
    expect(
      screen.getByText(
        "Upload a file, paste code, or load an example to run a review.",
      ),
    ).toBeInTheDocument();
  });

  it("runs a local example review and toggles diagnostics", async () => {
    const view = await renderApp();
    chooseTinyModel();
    expect(await screen.findByRole("heading", { name: "Local model ready." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs" })).toBeDisabled();

    loadExample();
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.python);
    expect(screen.getByRole("button", { name: "View logs" })).toBeDisabled();

    runReview.mockImplementation(async (_provider, _request, onProgress, onLog) => {
      onProgress?.({ progress: 0.2, text: "Downloading weights" });
      onLog?.({
        id: "log-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        stage: "review",
        message: "Starting a local code review.",
      });
      return reviewResult;
    });

    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("Solid work")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Good foundation" })).toBeInTheDocument();
    await view.click(screen.getByRole("button", { name: /Null crash/ }));
    const saveReview = screen.getByRole("button", { name: "Save review" });
    const diagnosticsButton = screen.getByRole("button", { name: "View logs" });
    expect(saveReview.parentElement).toBe(diagnosticsButton.parentElement);
    expect(diagnosticsButton).toBeEnabled();
    expect(runReview).toHaveBeenCalledWith(
      "browser",
      expect.objectContaining({ language: "python", code: EXAMPLES.python }),
      expect.any(Function),
      expect.any(Function),
      expect.any(AbortSignal),
    );

    await view.click(screen.getByRole("button", { name: "View logs" }));
    expect(screen.getByText("Starting a local code review.")).toBeInTheDocument();
    const diagnostics = screen.getByLabelText("Local model logs");
    expect(within(diagnostics).queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(within(diagnostics).getByRole("button", { name: "Copy logs" })).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: "Close logs" }));
    expect(
      screen.queryByText("Run a review to collect model logs."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("strips HTTP details from review errors and ignores empty submissions", async () => {
    const view = await renderApp();
    expect(screen.getByRole("button", { name: /Run review/ })).toBeDisabled();

    await view.type(screen.getByLabelText("Code to review"), "print(1)");
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(
      screen.getByText("Select a model before running a review."),
    ).toBeInTheDocument();
    chooseTinyModel();
    runReview.mockRejectedValue(
      new Error("Provider down (HTTP 503 Service Unavailable)"),
    );
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("GPU is still starting")).toBeInTheDocument();
    expect(screen.getByText("Provider down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry review" })).toBeInTheDocument();

    runReview.mockRejectedValue(new Error("  (HTTP 503 Service Unavailable)"));
    await view.click(screen.getByRole("button", { name: "Retry review" }));
    expect(await screen.findByText(/HTTP 503 Service Unavailable/)).toBeInTheDocument();
    expect(screen.getByText("GPU is still starting")).toBeInTheDocument();
  });

  it("requires sign-in before a cloud review", async () => {
    listInferenceProviders.mockResolvedValue([modalProvider]);
    const view = await renderApp();

    await view.selectOptions(
      screen.getByLabelText("Inference provider"),
      "modal",
    );
    expect(screen.getByLabelText("Review model")).toHaveValue("");
    expect(
      screen.queryByText(/Sign in before running a cloud review/),
    ).not.toBeInTheDocument();

    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(
      screen.getByText("Select a model before running a review."),
    ).toBeInTheDocument();

    chooseCloudModel();
    expect(screen.getByText(/Sign in before running a cloud review/)).toBeInTheDocument();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(screen.getByText("Sign in to use cloud inference.")).toBeInTheDocument();
    expect(runReview).not.toHaveBeenCalled();
  });

  it("shows local model progress while a review is in flight", async () => {
    let finish: ((result: typeof reviewResult) => void) | undefined;
    runReview.mockImplementation(
      (_provider, _request, onProgress, onLog) =>
        new Promise((resolve) => {
          onProgress?.({
            progress: 0.4,
            text: "Downloading weights",
            elapsedSeconds: 12.4,
          });
          onLog?.({
            id: "log-1",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "review",
            message: "Downloading weights",
          });
          finish = resolve;
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    expect(await screen.findByRole("heading", { name: "Local model ready." })).toBeInTheDocument();
    loadExample();
    expect(screen.getByRole("button", { name: "View logs" })).toBeDisabled();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(
      await screen.findByRole("heading", {
        name: `Loading ${REVIEW_CONFIG.model.label}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    const loading = screen.getByRole("status");
    expect(within(loading).getByText("40%")).toBeInTheDocument();
    expect(within(loading).getByText("12s elapsed")).toBeInTheDocument();
    expect(
      within(loading).getByText("Downloading model weights"),
    ).toBeInTheDocument();
    expect(
      within(loading).getByText(/first visit fetches model shards/),
    ).toBeInTheDocument();
    expect(
      within(loading).getByText(
        `Download ~${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs" })).toBeEnabled();

    await view.click(screen.getByRole("button", { name: "View logs" }));
    expect(
      screen.getByLabelText("Local model logs"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Local model logs")).getByText(
        "Downloading weights",
      ),
    ).toBeInTheDocument();

    finish?.(reviewResult);
    expect(await screen.findByText("Solid work")).toBeInTheDocument();
  });

  it("shows local review details while WebLLM is analyzing", async () => {
    runReview.mockImplementation(
      (_provider, _request, onProgress, onLog) =>
        new Promise(() => {
          onProgress?.({
            progress: 1,
            text: "Prefilling the prompt on WebGPU…",
            elapsedSeconds: 4.2,
          });
          onLog?.({
            id: "log-review",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "review",
            message: "Starting a local code review.",
          });
          onLog?.({
            id: "log-prefill",
            timestamp: "2026-01-01T00:00:01.000Z",
            level: "info",
            stage: "generation",
            message: "Local model is ready. Prefilling the prompt on WebGPU.",
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(
      await screen.findByRole("heading", { name: "Reviewing your code" }),
    ).toBeInTheDocument();
    const loading = screen.getByRole("status");
    expect(within(loading).getByText("4.2s elapsed")).toBeInTheDocument();
    expect(
      within(loading).getByText("Prefilling the prompt on WebGPU"),
    ).toBeInTheDocument();
    expect(
      within(loading).getByText(/WebLLM still prefills your prompt/),
    ).toBeInTheDocument();
    expect(within(loading).getByText("Python")).toBeInTheDocument();
    expect(
      within(loading).getByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Review activity" }),
      ).getByText("Local model is ready. Prefilling the prompt on WebGPU."),
    ).toBeInTheDocument();
  });

  it("shows cloud GPU connection details while a review is in flight", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([modalProvider]);
    runReview.mockImplementation(
      (_provider, _request, _onProgress, onLog) =>
        new Promise(() => {
          onLog?.({
            id: "log-cloud",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            stage: "cloud-request",
            message: "Connecting to the cloud GPU.",
          });
        }),
    );
    const view = await renderApp();
    await view.selectOptions(
      screen.getByLabelText("Inference provider"),
      "modal",
    );
    chooseCloudModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(
      await screen.findByRole("heading", {
        name: "Connecting to the cloud GPU",
      }),
    ).toBeInTheDocument();
    const loading = screen.getByRole("status");
    expect(
      within(loading).getByText("Sending the review to the API"),
    ).toBeInTheDocument();
    expect(
      within(loading).getByText(/first review after idle/),
    ).toBeInTheDocument();
    expect(within(loading).getByText("Modal GPU Cloud")).toBeInTheDocument();
    expect(
      within(loading).getByText(`Model: ${modalProvider.modelId}`),
    ).toBeInTheDocument();
    expect(within(loading).getByText("Timeout: 55s")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Connection activity" }),
      ).getByText("Connecting to the cloud GPU."),
    ).toBeInTheDocument();
  });

  it("shows GPU boot details while the cloud worker is still starting", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([modalProvider]);
    runReview.mockImplementation(
      (_provider, _request, onProgress, onLog) =>
        new Promise(() => {
          onProgress?.({
            progress: 0,
            text: "The provider is starting up.",
            elapsedSeconds: 8,
          });
          onLog?.({
            id: "log-boot",
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "debug",
            stage: "cloud-http",
            message: "Retrying after retryable upstream status.",
          });
        }),
    );
    const view = await renderApp();
    await view.selectOptions(
      screen.getByLabelText("Inference provider"),
      "modal",
    );
    chooseCloudModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(
      await screen.findByRole("heading", { name: "GPU is starting, retrying…" }),
    ).toBeInTheDocument();
    const loading = screen.getByRole("status");
    expect(within(loading).getByText("GPU worker is booting")).toBeInTheDocument();
    expect(
      within(loading).getByText(/API retries while the GPU container starts/),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("list", { name: "Connection activity" }),
      ).getByText("Retrying after retryable upstream status."),
    ).toBeInTheDocument();
  });

  it("saves a completed review after sign-in and reopens it from history", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([modalProvider]);
    listHistory.mockResolvedValue([historySummary]);
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await screen.findByRole("button", { name: "Browser WebLLM Python" });
    await view.click(screen.getByRole("link", { name: "Review" }));

    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("Solid work")).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: /Null crash/ }));
    await view.click(screen.getByRole("button", { name: /Null crash/ }));

    await view.click(screen.getByRole("button", { name: "Save review" }));
    await waitFor(() =>
      expect(saveHistory).toHaveBeenCalledWith(
        expect.objectContaining({ code: EXAMPLES.python, language: "python" }),
      ),
    );
    expect(await screen.findByRole("heading", { name: "Your reviews" })).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: "Browser WebLLM Python" }));
    expect(
      await screen.findByRole("heading", { name: /Review your code/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Code to review")).toHaveValue("pass");
  });

  it("sends anonymous users to sign in when they try to save", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await screen.findByText("Solid work");
    await view.click(screen.getByRole("button", { name: "Save review" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(saveHistory).not.toHaveBeenCalled();
  });

  it("surfaces history load, save, and delete failures", async () => {
    getSession.mockResolvedValue(user);
    listHistory.mockRejectedValue(new Error("Could not load history."));
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText("Could not load history.")).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Review" }));
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await screen.findByText("Solid work");

    saveHistory.mockRejectedValueOnce(new Error("Disk full"));
    await view.click(screen.getByRole("button", { name: "Save review" }));
    await waitFor(() => expect(saveHistory).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent("Disk full");
    expect(
      screen.getByRole("heading", { name: /Review your code/ }),
    ).toBeInTheDocument();

    listHistory.mockResolvedValue([historySummary]);
    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await screen.findByRole("button", { name: "Browser WebLLM Python" });
    getHistoryEntry.mockRejectedValueOnce(new Error("Could not open history."));
    await view.click(screen.getByRole("button", { name: "Browser WebLLM Python" }));
    expect(
      await screen.findAllByText("Could not open history."),
    ).not.toHaveLength(0);
    deleteHistory.mockRejectedValueOnce("nope");
    await view.click(screen.getByRole("button", { name: "Delete saved review" }));
    await view.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      await screen.findAllByText("Could not delete history."),
    ).not.toHaveLength(0);
  });

  it("deletes history, starts a new review, and signs out", async () => {
    getSession.mockResolvedValue(user);
    listHistory.mockResolvedValue([historySummary]);
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { name: "Your reviews" })).toBeInTheDocument();
    await view.click(screen.getByRole("button", { name: "Delete saved review" }));
    await view.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteHistory).toHaveBeenCalledWith(historyEntry.id));
    expect(screen.getByText("No saved reviews yet")).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Review" }));

    await view.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("stars a saved review so it appears under favorites", async () => {
    getSession.mockResolvedValue(user);
    listHistory.mockResolvedValue([historySummary]);
    const view = await renderApp("/dashboard");

    await screen.findByRole("button", { name: "Browser WebLLM Python" });
    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    await view.click(screen.getByRole("button", { name: "Star favorite" }));
    await waitFor(() =>
      expect(starHistory).toHaveBeenCalledWith(historySummary.id, true),
    );
    expect(await screen.findByText("Favorites")).toBeInTheDocument();
  });

  it("surfaces favorite update failures", async () => {
    getSession.mockResolvedValue(user);
    listHistory.mockResolvedValue([historySummary]);
    starHistory.mockRejectedValueOnce(new Error("Could not update favorite."));
    const view = await renderApp("/dashboard");

    await screen.findByRole("button", { name: "Browser WebLLM Python" });
    await view.click(screen.getByRole("button", { name: "Star favorite" }));
    expect(
      await screen.findAllByText("Could not update favorite."),
    ).not.toHaveLength(0);
  });

  it("keeps example code in sync with language and clears the editor", async () => {
    const view = await renderApp();
    loadExample();
    await view.selectOptions(
      screen.getByLabelText("Load an example"),
      "typescript",
    );
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.typescript);
    await view.selectOptions(
      screen.getByLabelText("Load an example"),
      "go",
    );
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.go);
    await view.selectOptions(
      screen.getByLabelText("Load an example"),
      "rust",
    );
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.rust);
    await view.selectOptions(
      screen.getByLabelText("Load an example"),
      "cpp",
    );
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.cpp);

    const clear = screen.getByRole("button", { name: "Clear" });
    const runReviewButton = screen.getByRole("button", { name: /Run review/ });
    expect(
      clear.compareDocumentPosition(runReviewButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    await view.click(clear);
    expect(screen.getByLabelText("Code to review")).toHaveValue("");
  });

  it("uploads a source file into the editor and infers the language", async () => {
    const view = await renderApp();
    loadExample();
    expect(screen.getByLabelText("Code to review")).toHaveValue(EXAMPLES.python);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain(".py");

    await view.click(screen.getByRole("button", { name: "Upload" }));
    const source = "package main\n\nfunc main() {}\n";
    await view.upload(
      input,
      new File([source], "server.go", { type: "text/plain" }),
    );

    expect(screen.getByLabelText("Code to review")).toHaveValue(source);
    expect(screen.getByLabelText("Load an example")).toHaveValue("go");
  });

  it("keeps the current language when the uploaded file has no known extension", async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText("Load an example"), {
      target: { value: "rust" },
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const source = "fn main() {}";
    fireEvent.change(input, {
      target: {
        files: [new File([source], "notes.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Code to review")).toHaveValue(source),
    );
    expect(screen.getByLabelText("Load an example")).toHaveValue("rust");
  });

  it("toasts when an uploaded file is empty or unreadable", async () => {
    const view = await renderApp();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    await view.upload(
      input,
      new File(["   \n"], "empty.py", { type: "text/plain" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is empty.",
    );
    expect(screen.getByLabelText("Code to review")).toHaveValue("");

    const unreadable = new File(["print(1)"], "broken.py", {
      type: "text/plain",
    });
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("read failed"));
    await view.upload(input, unreadable);
    expect(
      await screen.findByText("Could not read that file."),
    ).toBeInTheDocument();
  });

  it("loads oversized uploads and warns about the model character limit", async () => {
    const view = await renderApp();
    chooseTinyModel();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const limit = REVIEW_CONFIG.limits.maxCodeCharacters;
    const source = `${"x".repeat(limit + 1)}\n`;
    await view.upload(
      input,
      new File([source], "big.py", { type: "text/plain" }),
    );

    expect(screen.getByLabelText("Code to review")).toHaveValue(source);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `File loaded, but this model accepts up to ${limit.toLocaleString()} characters per review.`,
    );
  });

  it("warns with the cloud model limit when uploading oversized code", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([
      { ...modalProvider, maxCodeCharacters: 120 },
    ]);
    const view = await renderApp();
    await view.selectOptions(
      screen.getByLabelText("Inference provider"),
      "modal",
    );
    chooseCloudModel();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const source = `${"y".repeat(121)}\n`;
    await view.upload(
      input,
      new File([source], "big.py", { type: "text/plain" }),
    );

    expect(screen.getByLabelText("Code to review")).toHaveValue(source);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "File loaded, but this model accepts up to 120 characters per review.",
    );
  });

  it("ignores upload changes that do not include a file", async () => {
    await renderApp();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: null } });
    expect(screen.getByLabelText("Code to review")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts an empty review when the brand mark is clicked", async () => {
    const view = await renderApp();
    loadExample();
    chooseTinyModel();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("Solid work")).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Go to home" }));
    expect(screen.getByLabelText("Code to review")).toHaveValue("");
    expect(screen.queryByText("Solid work")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Review your code/ }),
    ).toBeInTheDocument();
  });

  it("shows generating copy once while tokens stream", async () => {
    runReview.mockImplementation((_provider, _request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the review…",
        streamedText: '{"score":',
      });
      return new Promise(() => {});
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(
      await screen.findByRole("heading", { name: "Generating the review…" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Generating the review…")).toHaveLength(1);
    expect(screen.getAllByText("Loading and generating…").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("log", { name: "Generated review output" }),
    ).toHaveTextContent('{"score":');
  });

  it("renders a review section as soon as a partial result arrives", async () => {
    runReview.mockImplementation((_provider, _request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the review…",
        result: {
          score: 88,
          summary: "Solid work",
          metrics: [],
          findings: [],
          durationMs: 400,
          partial: true,
        },
      });
      return new Promise(() => {});
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(await screen.findByText("Solid work")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("Reviewing…")).toBeInTheDocument();
    expect(screen.getAllByText("Loading and generating…")).toHaveLength(1);
    expect(
      screen.queryByText(
        "The model is still writing metrics, findings, and remaining analysis.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("log", { name: "Generated review output" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save review" })).not.toBeInTheDocument();
  });

  it("keeps a streamed local review if final JSON validation fails", async () => {
    runReview.mockImplementation(async (_provider, _request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the review…",
        result: {
          score: 88,
          summary: "Solid work",
          metrics: [],
          findings: [],
          durationMs: 400,
          partial: true,
        },
      });
      throw new Error("TinySwallow returned invalid JSON.");
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));

    expect(await screen.findByText("Solid work")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.queryByText("TinySwallow returned invalid JSON.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save review" })).toBeInTheDocument();
  });

  it("cancels an in-flight review without a toast when returning home", async () => {
    runReview.mockImplementation(
      (_provider, _request, _onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Review cancelled.");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Go to home" }));
    expect(screen.getByLabelText("Code to review")).toHaveValue("");
    expect(screen.queryByText("Review cancelled.")).not.toBeInTheDocument();
  });

  it("places TinySwallow under inference and updates configs with the runtime", async () => {
    listInferenceProviders.mockResolvedValue([modalProvider]);
    const view = await renderApp();

    const inference = screen.getByLabelText("Inference provider");
    const model = screen.getByLabelText("Review model");
    expect(within(inference).getByRole("option", { name: "Modal GPU Cloud" })).toBeInTheDocument();
    expect(
      within(inference).getByRole("option", { name: "Browser · WebLLM (Recommended)" }),
    ).toBeInTheDocument();
    expect(
      inference.compareDocumentPosition(model) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(model).toHaveValue("");
    expect(
      screen.queryByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();

    await view.selectOptions(model, REVIEW_CONFIG.defaultModelId);
    expect(model).toHaveValue(REVIEW_CONFIG.defaultModelId);
    expect(
      screen.getByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Selecting this model downloads and caches approximately ${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB of model data.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.2");

    await view.selectOptions(inference, "modal");
    expect(model).toHaveValue("");
    expect(
      screen.queryByText(`Model: ${modalProvider.modelId}`),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();

    await view.selectOptions(model, modalProvider.modelId);
    expect(model).toHaveValue(modalProvider.modelId);
    expect(
      screen.getByText(`Model: ${modalProvider.modelId}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.1");

    await view.selectOptions(inference, "browser");
    await waitFor(() => expect(model).toHaveValue(""));
    expect(
      screen.queryByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();
  });

  it("shows Hugging Face Cloud and Modal GPU Cloud in the inference toggle", async () => {
    listInferenceProviders.mockResolvedValue([
      { ...huggingfaceProvider, label: "Hugging Face Inference" },
      { ...modalProvider, label: "Modal Cloud GPU" },
    ]);
    await renderApp();

    const inference = screen.getByLabelText("Inference provider");
    expect(
      within(inference).getByRole("option", { name: "Hugging Face Cloud" }),
    ).toBeInTheDocument();
    expect(
      within(inference).getByRole("option", { name: "Modal GPU Cloud" }),
    ).toBeInTheDocument();
    expect(
      within(inference).queryByRole("option", { name: "Hugging Face Inference" }),
    ).not.toBeInTheDocument();
    expect(
      within(inference).queryByRole("option", { name: "Modal Cloud GPU" }),
    ).not.toBeInTheDocument();
  });

  it("reloads TinySwallow defaults when the model is selected", async () => {
    await renderApp();
    chooseTinyModel();

    const temperature = screen.getByLabelText("Temperature");
    expect(temperature).toHaveAttribute("type", "range");
    expect(temperature).toHaveAttribute("min", "0");
    expect(temperature).toHaveAttribute("max", "1");
    expect(temperature).toHaveAccessibleDescription(
      "Control randomness. Lower keeps reviews consistent. Higher makes findings more varied.",
    );
    expect(
      screen.getByLabelText("Maximum output tokens"),
    ).toHaveAccessibleDescription(
      "Caps generated review length. Short is faster; longer budgets are less likely to cut off the output.",
    );
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Control randomness. Lower keeps reviews consistent. Higher makes findings more varied.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Caps generated review length. Short is faster; longer budgets are less likely to cut off the output.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Max source characters so instructions and the review still fit in the 4K window.",
      }),
    ).toBeInTheDocument();
    fireEvent.change(temperature, { target: { value: "0.9" } });
    expect(temperature).toHaveValue("0.9");
    fireEvent.change(temperature, { target: { value: "2" } });
    expect(temperature).toHaveValue("1");

    fireEvent.change(screen.getByLabelText("Review model"), {
      target: { value: REVIEW_CONFIG.defaultModelId },
    });
    expect(temperature).toHaveValue("0.2");
    expect(
      screen.getByText(`Model: ${REVIEW_CONFIG.model.id}`),
    ).toBeInTheDocument();
  });

  it("reloads cloud model defaults when the deployed model is selected", async () => {
    listInferenceProviders.mockResolvedValue([modalProvider]);
    const view = await renderApp();

    await view.selectOptions(screen.getByLabelText("Inference provider"), "modal");
    expect(screen.getByLabelText("Review model")).toHaveValue("");
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();

    chooseCloudModel();
    expect(screen.getByLabelText("Review model")).toHaveValue(
      modalProvider.modelId,
    );

    const temperature = screen.getByLabelText("Temperature");
    fireEvent.change(temperature, { target: { value: "0.9" } });
    expect(temperature).toHaveValue("0.9");

    fireEvent.change(screen.getByLabelText("Review model"), {
      target: { value: modalProvider.modelId },
    });
    expect(temperature).toHaveValue("0.1");
    expect(
      screen.getByText(`Model: ${modalProvider.modelId}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "How long the API waits for a cloud review.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Per-user cloud review cap in this app.",
      }),
    ).toBeInTheDocument();
  });

  it("updates generation parameters and loads cloud provider settings", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([modalProvider]);
    const view = await renderApp();

    await view.selectOptions(
      screen.getByLabelText("Inference provider"),
      "modal",
    );
    expect(
      screen.queryByText("Runs on a dedicated Modal GPU."),
    ).not.toBeInTheDocument();

    chooseCloudModel();
    expect(screen.getByText("Runs on a dedicated Modal GPU.")).toBeInTheDocument();

    const temperature = screen.getByLabelText("Temperature");
    fireEvent.change(temperature, { target: { value: "0.8" } });
    expect(temperature).toHaveValue("0.8");

    await view.selectOptions(
      screen.getByLabelText("Maximum output tokens"),
      "256",
    );

    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await waitFor(() =>
      expect(runReview).toHaveBeenCalledWith(
        "modal",
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.8,
            maxTokens: 256,
            maxFindings: 3,
          }),
        }),
        expect.any(Function),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
  });

  it("restores a cloud review and its generation settings from history", async () => {
    getSession.mockResolvedValue(user);
    listInferenceProviders.mockResolvedValue([modalProvider]);
    const cloudEntry = {
      ...historyEntry,
      result: {
        ...reviewResult,
        inference: {
          ...reviewResult.inference!,
          provider: "modal" as const,
          generationConfig: { temperature: 0.1, maxTokens: 256 },
        },
      },
    };
    listHistory.mockResolvedValue([
      {
        ...historySummary,
        provider: "modal",
        temperature: 0.1,
        maxTokens: 256,
        maxFindings: undefined,
      },
    ]);
    getHistoryEntry.mockResolvedValue(cloudEntry);
    const view = await renderApp();
    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await view.click(
      screen.getByRole("button", { name: "Modal GPU Cloud Python" }),
    );
    expect(await screen.findByLabelText("Inference provider")).toHaveValue(
      "modal",
    );
    expect(screen.getByLabelText("Review model")).toHaveValue(
      modalProvider.modelId,
    );
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.1");
  });

  it("falls back to the browser provider when a saved cloud backend disappears", async () => {
    listInferenceProviders.mockRejectedValue(new Error("offline"));
    await renderApp();
    expect(screen.getByLabelText("Inference provider")).toHaveValue("browser");
    expect(within(screen.getByLabelText("Inference provider")).queryByRole("option", { name: /Modal/ })).toBeNull();
  });

  it("falls back to the browser runtime when the default cloud provider is unavailable", async () => {
    defaultProvider.current = "custom";
    listInferenceProviders.mockResolvedValue([modalProvider]);
    await renderApp();
    await waitFor(() =>
      expect(screen.getByLabelText("Inference provider")).toHaveValue("browser"),
    );
  });

  it("opens documentation and authenticates from the login form", async () => {
    const view = await renderApp();
    await view.click(screen.getByRole("link", { name: "Documentation" }));
    expect(screen.getByRole("heading", { name: "Documentation" })).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Sign in" }));
    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    const signInButtons = screen.getAllByRole("button", { name: "Sign in" });
    await view.click(signInButtons[signInButtons.length - 1]);
    expect(await screen.findByRole("heading", { name: "Your reviews" })).toBeInTheDocument();
  });

  it("shows a non-Error review failure", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    runReview.mockRejectedValue("boom");
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("Could not run the review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View logs" })).toBeDisabled();
  });

  it("cancels an in-flight review", async () => {
    runReview.mockImplementation(
      (_provider, _request, _onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Review cancelled.");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Review cancelled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run review/ })).toBeInTheDocument();
  });

  it("lets you continue a cancelled WebLLM review from the last tokens", async () => {
    runReview.mockImplementation(
      (_provider, _request, onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          onProgress?.({
            progress: 1,
            text: "Generating the review…",
            streamedText: '{"score": 80, "summary":',
          });
          signal?.addEventListener("abort", () => {
            reject(
              new ReviewInterruptedError('{"score": 80, "summary":', {
                elapsedMs: 1500,
              }),
            );
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText("Review paused. Continue from where it stopped."),
    ).toBeInTheDocument();
    expect(screen.getByText("Review interrupted")).toBeInTheDocument();
    expect(
      screen.getByRole("log", { name: "Generated review output" }),
    ).toHaveTextContent('{"score": 80, "summary":');
    expect(
      screen.getAllByRole("button", { name: "Continue review" }).length,
    ).toBeGreaterThan(0);

    runReview.mockImplementation(
      (_provider, request) => {
        expect(request.resumeFrom).toBe('{"score": 80, "summary":');
        expect(request.resumeElapsedMs).toBe(1500);
        return Promise.resolve(reviewResult);
      },
    );
    await view.click(screen.getAllByRole("button", { name: "Continue review" })[0]);
    expect(await screen.findByText("Solid work")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue review" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run review/ })).toBeInTheDocument();
  });

  it("keeps a partial score after interrupt and can start the review over", async () => {
    runReview.mockImplementation(
      (_provider, _request, onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          onProgress?.({
            progress: 1,
            text: "Generating the review…",
            result: {
              score: 88,
              summary: "Solid work",
              metrics: [],
              findings: [],
              durationMs: 400,
              partial: true,
            },
          });
          signal?.addEventListener("abort", () => {
            reject(
              new ReviewInterruptedError('{"score": 88, "summary": "Solid work"', {
                elapsedMs: 400,
                partialResult: {
                  score: 88,
                  summary: "Solid work",
                  metrics: [],
                  findings: [],
                  durationMs: 400,
                  partial: true,
                },
              }),
            );
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Interrupted")).toBeInTheDocument();
    expect(screen.getByText("Solid work")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();

    runReview.mockResolvedValue(reviewResult);
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    await waitFor(() =>
      expect(runReview).toHaveBeenLastCalledWith(
        "browser",
        expect.objectContaining({ resumeFrom: undefined }),
        expect.any(Function),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
  });

  it("keeps a completed review when the editor echoes the same code", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(await screen.findByText("Solid work")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Code to review"), {
      target: { value: EXAMPLES.python },
    });
    expect(screen.getByText("Solid work")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Ready when you are" }),
    ).not.toBeInTheDocument();
  });

  it("shows a WebLLM abort as a review error unless the user cancelled", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    const error = new Error("Failed to fetch model shard.");
    error.name = "AbortError";
    runReview.mockRejectedValue(error);
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(
      await screen.findByText("Failed to fetch model shard."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Review cancelled.")).not.toBeInTheDocument();
  });

  it("renders a 404 for unknown routes", async () => {
    await renderApp("/missing");
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to review" })).toBeInTheDocument();
  });

  it("redirects legacy documentation hashes", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/", hash: "#docs/overview" }]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Documentation" })).toBeInTheDocument();
  });

  it("switches the chrome into Japanese", async () => {
    const view = await renderApp();
    await view.click(screen.getByRole("button", { name: "日本語" }));
    expect(screen.getByRole("link", { name: "レビュー" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ja");
    await view.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("sends signed-out users from protected routes to sign in", async () => {
    getSession.mockImplementation(() => new Promise(() => {}));
    const pending = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>,
    );
    expect(document.querySelector(".route-loading")).toBeInTheDocument();
    pending.unmount();

    getSession.mockResolvedValue(null);
    await renderApp("/dashboard");
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("opens the account page and returns home after deletion", async () => {
    getSession.mockResolvedValue(user);
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await view.click(screen.getByRole("link", { name: "Account" }));
    expect(screen.getByRole("heading", { name: "M" })).toBeInTheDocument();
    expect(screen.getByText("m@example.com")).toBeInTheDocument();

    await view.type(screen.getByLabelText("Confirm password"), "password1");
    await view.click(screen.getByRole("button", { name: "Delete account" }));
    expect(deleteAccount).toHaveBeenCalledWith("password1");
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });

  it("surfaces a browser model preload failure", async () => {
    preloadBrowserModel.mockRejectedValueOnce(new Error("cache corrupt"));
    await renderApp();
    chooseTinyModel();
    expect(await screen.findByText("cache corrupt")).toBeInTheDocument();
  });

  it("explains how to enable WebGPU when the local runtime is unavailable", async () => {
    preloadBrowserModel.mockRejectedValueOnce(
      new Error(
        "WebGPU is unavailable. Open this demo in a current Chrome, Edge, Firefox, or Safari browser with WebGPU enabled.",
      ),
    );
    await renderApp();
    chooseTinyModel();
    expect(
      await screen.findByRole("heading", { name: "WebGPU is unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Local TinySwallow reviews need WebGPU in this tab."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/HTTPS or http:\/\/localhost/, { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open WebGPU Report" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {
        name: "Full browser and GPU troubleshooting",
      }),
    ).not.toBeInTheDocument();
  });

  it("explains how to enable WebGPU when no adapter is found", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    runReview.mockRejectedValueOnce(
      new Error(
        "Unable to find a compatible GPU. Enable WebGPU in your browser, then confirm a hardware adapter at https://webgpureport.org/.",
      ),
    );
    await view.click(screen.getByRole("button", { name: /Run review/ }));
    expect(
      await screen.findByRole("heading", { name: "WebGPU is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/chrome:\/\/flags\/#enable-unsafe-webgpu/)).toBeInTheDocument();
  });

  it("surfaces a non-Error browser model preload failure", async () => {
    preloadBrowserModel.mockRejectedValueOnce("offline");
    await renderApp();
    chooseTinyModel();
    expect(await screen.findByText("Could not run the review.")).toBeInTheDocument();
  });

  it("ignores browser preload updates after unmount", async () => {
    let onProgress: ((progress: { progress: number; text: string }) => void) | undefined;
    let onLog:
      | ((entry: {
          id: string;
          timestamp: string;
          level: string;
          stage: string;
          message: string;
        }) => void)
      | undefined;
    let finish: (value?: unknown) => void = () => {};
    preloadBrowserModel.mockImplementation((progress, log) => {
      onProgress = progress;
      onLog = log;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await screen.findByLabelText("Primary navigation");
    chooseTinyModel();
    await waitFor(() => expect(preloadBrowserModel).toHaveBeenCalled());
    onProgress?.({ progress: 0.4, text: "Downloading weights" });
    onLog?.({
      id: "log-preload",
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info",
      stage: "download",
      message: "Fetching shards",
    });
    pending.unmount();
    onProgress?.({ progress: 0.8, text: "Compiling" });
    onLog?.({
      id: "log-preload-late",
      timestamp: "2026-01-01T00:00:01.000Z",
      level: "info",
      stage: "download",
      message: "Late shard",
    });
    finish();
    await Promise.resolve();
  });

  it("ignores a late browser preload rejection after unmount", async () => {
    let fail: (reason?: unknown) => void = () => {};
    preloadBrowserModel.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await screen.findByLabelText("Primary navigation");
    chooseTinyModel();
    await waitFor(() => expect(preloadBrowserModel).toHaveBeenCalled());
    pending.unmount();
    fail(new Error("late failure"));
    await Promise.resolve();
  });
});
