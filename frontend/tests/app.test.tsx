import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { REVIEW_CONFIG } from "../src/config/review";
import { EXAMPLES } from "../src/data/examples";
import { ReviewInterruptedError } from "../src/review/resume";
import type { Language } from "../src/types/review";
import { historyEntry, historySummary, reviewResult, user } from "./fixtures";

const {
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
  runReview,
  preloadBrowserModel,
} = vi.hoisted(() => ({
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
  runReview: vi.fn(),
  preloadBrowserModel: vi.fn(),
}));

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
    translation: entry.result.translation,
    starred: Boolean(entry.starred),
    provider: entry.result.inference?.provider,
    modelId: entry.result.inference?.modelId,
    temperature: entry.result.inference?.generationConfig.temperature,
    maxTokens: entry.result.inference?.generationConfig.maxTokens,
    durationMs: entry.result.durationMs,
  }),
}));

vi.mock("../src/services/reviewRunner", () => ({
  runReview,
}));

vi.mock("../src/services/review", () => ({
  preloadBrowserModel,
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
        aria-label="English to translate"
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
  fireEvent.change(screen.getByLabelText("Teaching model"), {
    target: { value: REVIEW_CONFIG.defaultModelId },
  });
}

function loadExample(language: Language = "polite") {
  const select = screen.getByLabelText("Load an example register") as HTMLSelectElement;
  if (select.value === language) {
    const other = language === "polite" ? "casual" : "polite";
    fireEvent.change(select, { target: { value: other } });
  }
  fireEvent.change(select, { target: { value: language } });
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      screen.getByRole("heading", { name: /my japanese AI/ }),
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

  it("shows the idle results prompt before any code is reviewed", async () => {
    await renderApp();
    const heading = screen.getByRole("heading", { name: "Ready when you are" });
    expect(heading.closest(".empty-state")).toBeTruthy();
    expect(
      screen.getByText(
        "Paste English, upload a text file, or load an example to start a lesson.",
      ),
    ).toBeInTheDocument();
  });

  it("runs a local example review", async () => {
    const view = await renderApp();
    chooseTinyModel();
    expect(await screen.findByRole("heading", { name: "Local model ready." })).toBeInTheDocument();

    loadExample();
    expect(screen.getByLabelText("English to translate")).toHaveValue(EXAMPLES.polite);

    runReview.mockImplementation(async () => reviewResult);

    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Japanese translation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to translate it" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Phrase notes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lesson" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
    expect(runReview).toHaveBeenCalledWith(
      expect.objectContaining({ language: "polite", code: EXAMPLES.polite }),
      expect.any(Function),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("strips HTTP details from review errors and ignores empty submissions", async () => {
    const view = await renderApp();
    expect(screen.getByRole("button", { name: /Run lesson/ })).toBeDisabled();

    await view.type(screen.getByLabelText("English to translate"), "print(1)");
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(
      screen.getByText("Select a model before running a lesson."),
    ).toBeInTheDocument();
    chooseTinyModel();
    runReview.mockRejectedValue(
      new Error("Provider down (HTTP 503 Service Unavailable)"),
    );
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("Lesson could not run")).toBeInTheDocument();
    expect(screen.getByText("Provider down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run lesson/ })).toBeInTheDocument();

    runReview.mockRejectedValue(new Error("  (HTTP 503 Service Unavailable)"));
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText(/HTTP 503 Service Unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Lesson could not run")).toBeInTheDocument();
  });


  it("shows local model progress while a review is in flight", async () => {
    let finish: ((result: typeof reviewResult) => void) | undefined;
    runReview.mockImplementation(
      (_request, onProgress) =>
        new Promise((resolve) => {
          onProgress?.({
            progress: 0.4,
            text: "Downloading weights",
            elapsedSeconds: 12.4,
          });
          finish = resolve;
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    expect(await screen.findByRole("heading", { name: "Local model ready." })).toBeInTheDocument();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));

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
      within(loading).queryByText("Downloading model weights"),
    ).not.toBeInTheDocument();
    expect(
      within(loading).queryByText("Downloading weights"),
    ).not.toBeInTheDocument();
    expect(
      within(loading).getByText(/first visit fetches model shards/),
    ).toBeInTheDocument();
    expect(
      within(loading).getByText(
        `Download ~${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Local model logs")).not.toBeInTheDocument();

    finish?.(reviewResult);
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();
  });

  it("shows local review details while WebLLM is analyzing", async () => {
    runReview.mockImplementation(
      (_request, onProgress) =>
        new Promise(() => {
          onProgress?.({
            progress: 1,
            text: "Prefilling the prompt on WebGPU…",
            elapsedSeconds: 4.2,
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));

    expect(
      await screen.findByRole("heading", { name: "Teaching your translation" }),
    ).toBeInTheDocument();
    const loading = screen.getByRole("status");
    expect(within(loading).getByText("4.2s elapsed")).toBeInTheDocument();
    expect(
      within(loading).queryByText("Prefilling the prompt on WebGPU"),
    ).not.toBeInTheDocument();
    expect(
      within(loading).queryByText("Prefilling the prompt on WebGPU…"),
    ).not.toBeInTheDocument();
    expect(
      within(loading).getByText(/WebLLM still prefills your prompt/),
    ).toBeInTheDocument();
    expect(within(loading).getByText("Polite")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Local model logs")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
  });



  it("saves a completed review after sign-in and reopens it from history", async () => {
    getSession.mockResolvedValue(user);
    listHistory.mockResolvedValue([historySummary]);
    const view = await renderApp();

    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await screen.findByRole("button", { name: "Polite" });
    await view.click(screen.getByRole("link", { name: "Conversation" }));

    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: "Save lesson" }));
    await waitFor(() =>
      expect(saveHistory).toHaveBeenCalledWith(
        expect.objectContaining({ code: EXAMPLES.polite, language: "polite" }),
      ),
    );
    expect(await screen.findByRole("heading", { name: "Your conversations" })).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: "Polite" }));
    expect(
      await screen.findByRole("heading", { name: /my japanese AI/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("English to translate")).toHaveValue("pass");
  });

  it("sends anonymous users to sign in when they try to save", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await screen.findByText("よろしくお願いします。");
    await view.click(screen.getByRole("button", { name: "Save lesson" }));
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

    await view.click(screen.getByRole("link", { name: "Conversation" }));
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await screen.findByText("よろしくお願いします。");

    saveHistory.mockRejectedValueOnce(new Error("Disk full"));
    await view.click(screen.getByRole("button", { name: "Save lesson" }));
    await waitFor(() => expect(saveHistory).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent("Disk full");
    expect(
      screen.getByRole("heading", { name: /my japanese AI/ }),
    ).toBeInTheDocument();

    listHistory.mockResolvedValue([historySummary]);
    await view.click(screen.getByRole("link", { name: "Dashboard" }));
    await screen.findByRole("button", { name: "Polite" });
    getHistoryEntry.mockRejectedValueOnce(new Error("Could not open history."));
    await view.click(screen.getByRole("button", { name: "Polite" }));
    expect(
      await screen.findAllByText("Could not open history."),
    ).not.toHaveLength(0);
    deleteHistory.mockRejectedValueOnce("nope");
    await view.click(screen.getByRole("button", { name: "Delete saved lesson" }));
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
    expect(await screen.findByRole("heading", { name: "Your conversations" })).toBeInTheDocument();
    await view.click(screen.getByRole("button", { name: "Delete saved lesson" }));
    await view.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteHistory).toHaveBeenCalledWith(historyEntry.id));
    expect(screen.getByText("No saved conversation yet")).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Conversation" }));

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

    await screen.findByRole("button", { name: "Polite" });
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

    await screen.findByRole("button", { name: "Polite" });
    await view.click(screen.getByRole("button", { name: "Star favorite" }));
    expect(
      await screen.findAllByText("Could not update favorite."),
    ).not.toHaveLength(0);
  });

  it("keeps example code in sync with language and clears the editor", async () => {
    const view = await renderApp();
    loadExample();
    await view.selectOptions(
      screen.getByLabelText("Load an example register"),
      "casual",
    );
    expect(screen.getByLabelText("English to translate")).toHaveValue(EXAMPLES.casual);
    await view.selectOptions(
      screen.getByLabelText("Load an example register"),
      "formal",
    );
    expect(screen.getByLabelText("English to translate")).toHaveValue(EXAMPLES.formal);
    await view.selectOptions(
      screen.getByLabelText("Load an example register"),
      "polite",
    );
    expect(screen.getByLabelText("English to translate")).toHaveValue(EXAMPLES.polite);

    const clear = screen.getByRole("button", { name: "Clear" });
    const runReviewButton = screen.getByRole("button", { name: /Run lesson/ });
    expect(
      clear.compareDocumentPosition(runReviewButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    await view.click(clear);
    expect(screen.getByLabelText("English to translate")).toHaveValue("");
  });

  it("uploads a source file into the editor and infers the language", async () => {
    const view = await renderApp();
    loadExample();
    expect(screen.getByLabelText("English to translate")).toHaveValue(EXAMPLES.polite);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toContain(".txt");

    await view.click(screen.getByRole("button", { name: "Upload" }));
    const source = "package main\n\nfunc main() {}\n";
    await view.upload(
      input,
      new File([source], "email.md", { type: "text/plain" }),
    );

    expect(screen.getByLabelText("English to translate")).toHaveValue(source);
    expect(screen.getByLabelText("Load an example register")).toHaveValue("polite");
  });

  it("keeps the current language when the uploaded file has no known extension", async () => {
    await renderApp();
    fireEvent.change(screen.getByLabelText("Load an example register"), {
      target: { value: "formal" },
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const source = "fn main() {}";
    fireEvent.change(input, {
      target: {
        files: [new File([source], "notes", { type: "text/plain" })],
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("English to translate")).toHaveValue(source),
    );
    expect(screen.getByLabelText("Load an example register")).toHaveValue("formal");
  });

  it("toasts when an uploaded file is empty or unreadable", async () => {
    const view = await renderApp();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    await view.upload(
      input,
      new File(["   \n"], "empty.txt", { type: "text/plain" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is empty.",
    );
    expect(screen.getByLabelText("English to translate")).toHaveValue("");

    const unreadable = new File(["print(1)"], "broken.txt", {
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
      new File([source], "big.txt", { type: "text/plain" }),
    );

    expect(screen.getByLabelText("English to translate")).toHaveValue(source);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `File loaded, but this model accepts up to ${limit.toLocaleString()} characters per lesson.`,
    );
  });


  it("ignores upload changes that do not include a file", async () => {
    await renderApp();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: null } });
    expect(screen.getByLabelText("English to translate")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("starts an empty review when the brand mark is clicked", async () => {
    const view = await renderApp();
    loadExample();
    chooseTinyModel();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Go to home" }));
    expect(screen.getByLabelText("English to translate")).toHaveValue("");
    expect(screen.queryByText("よろしくお願いします。")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /my japanese AI/ }),
    ).toBeInTheDocument();
  });

  it("shows generating copy once while tokens stream", async () => {
    runReview.mockImplementation((_request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the lesson…",
        streamedText: '{"translation":',
      });
      return new Promise(() => {});
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));

    expect(
      await screen.findByRole("heading", { name: "Generating the lesson…" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Generating the lesson…")).toHaveLength(1);
    expect(screen.getAllByText("Loading and generating…").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("log", { name: "Generated lesson output" }),
    ).toHaveTextContent('{"translation":');
  });

  it("renders a review section as soon as a partial result arrives", async () => {
    runReview.mockImplementation((_request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the lesson…",
        result: {
          translation: "よろしくお願いします。",
          lesson: "Use a polite closing.",
          durationMs: 400,
          partial: true,
        },
      });
      return new Promise(() => {});
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));

    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();
        expect(screen.getByText("Teaching…")).toBeInTheDocument();
    expect(screen.getAllByText("Loading and generating…")).toHaveLength(1);
    expect(
      screen.queryByText(
        "Building a Japanese translation and teaching notes…",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("log", { name: "Generated lesson output" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save lesson" })).not.toBeInTheDocument();
  });

  it("keeps a streamed local review if final JSON validation fails", async () => {
    runReview.mockImplementation(async (_request, onProgress) => {
      onProgress?.({
        progress: 1,
        text: "Generating the lesson…",
        result: {
          translation: "よろしくお願いします。",
          lesson: "Use a polite closing.",
          durationMs: 400,
          partial: true,
        },
      });
      throw new Error("TinySwallow returned invalid JSON.");
    });
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));

    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();
        expect(screen.queryByText("TinySwallow returned invalid JSON.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save lesson" })).toBeInTheDocument();
  });

  it("cancels an in-flight review without a toast when returning home", async () => {
    runReview.mockImplementation(
      (_request, _onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Lesson cancelled.");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await view.click(screen.getByRole("link", { name: "Go to home" }));
    expect(screen.getByLabelText("English to translate")).toHaveValue("");
    expect(screen.queryByText("Lesson cancelled.")).not.toBeInTheDocument();
  });

  it("shows TinySwallow model defaults after selecting a model", async () => {
    const view = await renderApp();

    expect(screen.queryByLabelText("Inference provider")).not.toBeInTheDocument();
    const model = screen.getByLabelText("Teaching model");
    expect(model).toHaveValue("");
    expect(screen.queryByLabelText("Temperature")).not.toBeInTheDocument();

    await view.selectOptions(model, REVIEW_CONFIG.defaultModelId);
    expect(model).toHaveValue(REVIEW_CONFIG.defaultModelId);
    expect(
      screen.getByText(
        `Download: ~${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: `Selecting this model downloads and caches approximately ${REVIEW_CONFIG.model.downloadSizeMB.toLocaleString()} MB of model data.`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.2");
  });


  it("updates generation parameters for the browser model", async () => {
    const view = await renderApp();
    chooseTinyModel();

    const temperature = screen.getByLabelText("Temperature");
    fireEvent.change(temperature, { target: { value: "0.8" } });
    expect(temperature).toHaveValue("0.8");

    await view.selectOptions(
      screen.getByLabelText("Maximum output tokens"),
      "256",
    );

    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await waitFor(() =>
      expect(runReview).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.8,
            maxTokens: 256,
          }),
        }),
        expect.any(Function),
        undefined,
        expect.any(AbortSignal),
      ),
    );
  });



  it("reloads TinySwallow defaults when the model is selected", async () => {
    await renderApp();
    chooseTinyModel();

    const temperature = screen.getByLabelText("Temperature");
    expect(temperature).toHaveAttribute("type", "range");
    expect(temperature).toHaveAttribute("min", "0");
    expect(temperature).toHaveAttribute("max", "1");
    expect(temperature).toHaveAccessibleDescription(
      "Control randomness. Lower keeps lessons consistent. Higher makes teaching notes more varied.",
    );
    expect(
      screen.getByLabelText("Maximum output tokens"),
    ).toHaveAccessibleDescription(
      "Caps generated lesson length. Short is faster; longer budgets are less likely to cut off the output.",
    );
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Control randomness. Lower keeps lessons consistent. Higher makes teaching notes more varied.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Caps generated lesson length. Short is faster; longer budgets are less likely to cut off the output.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", {
        hidden: true,
        name: "Max English characters so instructions and the lesson still fit in the 4K window.",
      }),
    ).toBeInTheDocument();
    fireEvent.change(temperature, { target: { value: "0.9" } });
    expect(temperature).toHaveValue("0.9");
    fireEvent.change(temperature, { target: { value: "2" } });
    expect(temperature).toHaveValue("1");

    fireEvent.change(screen.getByLabelText("Teaching model"), {
      target: { value: REVIEW_CONFIG.defaultModelId },
    });
    expect(temperature).toHaveValue("0.2");
  });






  it("authenticates from the login form", async () => {
    const view = await renderApp();
    await view.click(screen.getByRole("link", { name: "Sign in" }));
    await view.type(screen.getByLabelText("Email"), "m@example.com");
    await view.type(screen.getByLabelText("Password"), "password1");
    const signInButtons = screen.getAllByRole("button", { name: "Sign in" });
    await view.click(signInButtons[signInButtons.length - 1]);
    expect(await screen.findByRole("heading", { name: "Your conversations" })).toBeInTheDocument();
  });

  it("shows a non-Error review failure", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    runReview.mockRejectedValue("boom");
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("Could not run the lesson.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
  });

  it("cancels an in-flight review", async () => {
    runReview.mockImplementation(
      (_request, _onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Lesson cancelled.");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Lesson cancelled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run lesson/ })).toBeInTheDocument();
  });

  it("lets you continue a cancelled WebLLM review from the last tokens", async () => {
    runReview.mockImplementation(
      (_request, onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          onProgress?.({
            progress: 1,
            text: "Generating the lesson…",
            streamedText: '{"translation": 80, "summary":',
          });
          signal?.addEventListener("abort", () => {
            reject(
              new ReviewInterruptedError('{"translation": 80, "summary":', {
                elapsedMs: 1500,
              }),
            );
          });
        }),
    );
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText("Lesson paused. Continue from where it stopped."),
    ).toBeInTheDocument();
    expect(screen.getByText("Lesson interrupted")).toBeInTheDocument();
    expect(
      screen.getByRole("log", { name: "Generated lesson output" }),
    ).toHaveTextContent('{"translation": 80, "summary":');
    expect(
      screen.getAllByRole("button", { name: "Continue lesson" }).length,
    ).toBeGreaterThan(0);

    runReview.mockImplementation(
      (request) => {
        expect(request.resumeFrom).toBe('{"translation": 80, "summary":');
        expect(request.resumeElapsedMs).toBe(1500);
        return Promise.resolve(reviewResult);
      },
    );
    await view.click(screen.getAllByRole("button", { name: "Continue lesson" })[0]);
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue lesson" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run lesson/ })).toBeInTheDocument();
  });

  it("keeps a partial translation after interrupt and can start the review over", async () => {
    runReview.mockImplementation(
      (_request, onProgress, _onLog, signal) =>
        new Promise((_resolve, reject) => {
          onProgress?.({
            progress: 1,
            text: "Generating the lesson…",
            result: {
              translation: "よろしくお願いします。",
              lesson: "Use a polite closing.",
                  durationMs: 400,
              partial: true,
            },
          });
          signal?.addEventListener("abort", () => {
            reject(
              new ReviewInterruptedError(
                '{"translation": "よろしくお願いします。", "lesson": "Use a polite closing."',
                {
                elapsedMs: 400,
                partialResult: {
                  translation: "よろしくお願いします。",
                  lesson: "Use a polite closing.",
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
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await view.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Interrupted")).toBeInTheDocument();
    expect(screen.getByText("よろしくお願いします。")).toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();

    runReview.mockResolvedValue(reviewResult);
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    await waitFor(() =>
      expect(runReview).toHaveBeenLastCalledWith(
        expect.objectContaining({ resumeFrom: undefined }),
        expect.any(Function),
        undefined,
        expect.any(AbortSignal),
      ),
    );
  });

  it("keeps a completed review when the editor echoes the same code", async () => {
    const view = await renderApp();
    chooseTinyModel();
    loadExample();
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(await screen.findByText("よろしくお願いします。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("English to translate"), {
      target: { value: EXAMPLES.polite },
    });
    expect(screen.getByText("よろしくお願いします。")).toBeInTheDocument();
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
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(
      await screen.findByText("Failed to fetch model shard."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lesson cancelled.")).not.toBeInTheDocument();
  });

  it("renders a 404 for unknown routes", async () => {
    await renderApp("/missing");
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to lesson" })).toBeInTheDocument();
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
      screen.getByText("Local TinySwallow lessons need WebGPU in this tab."),
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
    await view.click(screen.getByRole("button", { name: /Run lesson/ }));
    expect(
      await screen.findByRole("heading", { name: "WebGPU is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/chrome:\/\/flags\/#enable-unsafe-webgpu/)).toBeInTheDocument();
  });

  it("surfaces a non-Error browser model preload failure", async () => {
    preloadBrowserModel.mockRejectedValueOnce("offline");
    await renderApp();
    chooseTinyModel();
    expect(await screen.findByText("Could not run the lesson.")).toBeInTheDocument();
  });

  it("ignores browser preload updates after unmount", async () => {
    let onProgress: ((progress: { progress: number; text: string }) => void) | undefined;
    let finish: (value?: unknown) => void = () => {};
    preloadBrowserModel.mockImplementation((progress) => {
      onProgress = progress;
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
    pending.unmount();
    onProgress?.({ progress: 0.8, text: "Compiling" });
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
