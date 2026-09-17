import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "../src/components/HistoryPanel";
import { REVIEW_CONFIG } from "../src/config/review";
import { historySummary } from "./fixtures";

const actions = {
  onOpen: vi.fn(),
  onStar: vi.fn(),
  onDelete: vi.fn(),
};

describe("HistoryPanel", () => {
  it("shows a loading state before the first page of history arrives", () => {
    render(
      <HistoryPanel
        entries={[]}
        isLoading
        error={null}
        {...actions}
      />,
    );
    expect(screen.getByText("Loading lesson history…")).toBeInTheDocument();
  });

  it("shows an empty library and surfaces load errors", () => {
    render(
      <HistoryPanel
        entries={[]}
        isLoading={false}
        error="Could not load history."
        {...actions}
      />,
    );

    expect(screen.getByText("No saved conversation yet")).toBeInTheDocument();
    expect(screen.getByText("Could not load history.")).toBeInTheDocument();
  });

  it("opens and deletes saved reviews", async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    const view = userEvent.setup();
    render(
      <HistoryPanel
        entries={[
          historySummary,
          {
            ...historySummary,
            id: "no-inference",
            provider: undefined,
            modelId: undefined,
            temperature: undefined,
            maxTokens: undefined,
            durationMs: undefined,
          },
          {
            ...historySummary,
            id: "empty-code",
            codePreview: "",
            provider: "mystery",
            modelId: "",
            temperature: undefined,
            maxTokens: undefined,
            durationMs: undefined,
          },
        ]}
        isLoading={false}
        error={null}
        {...actions}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    expect(screen.getAllByText("Polite").length).toBeGreaterThan(0);
    expect(screen.queryByText("Browser WebLLM")).not.toBeInTheDocument();
    expect(screen.queryByText("mystery")).not.toBeInTheDocument();
    expect(screen.getByText("test-model")).toBeInTheDocument();
    expect(screen.queryByText("Empty submission")).not.toBeInTheDocument();
    expect(screen.queryByText("pass")).not.toBeInTheDocument();
    expect(screen.getAllByText("よろしくお願いします。").length).toBeGreaterThan(0);
    expect(screen.getByText("Temp 0.2")).toBeInTheDocument();
    expect(screen.getByText("256 tokens")).toBeInTheDocument();
    expect(
      [...document.querySelectorAll(".history-card__meta")].map((row) =>
        [...row.querySelectorAll("span")].map((tag) => tag.textContent),
      ),
    ).toEqual([["Polite"], ["Polite"], ["Polite"]]);
    expect(
      [...document.querySelectorAll(".history-card__params")].map((row) =>
        [...row.querySelectorAll("span")].map((tag) => tag.textContent),
      ),
    ).toEqual([
      [
        "1 lines",
        "4 characters",
        "test-model",
        "Temp 0.2",
        "256 tokens",
        "Inference time: 1.5 seconds",
      ],
      ["1 lines", "4 characters"],
      ["1 lines", "4 characters"],
    ]);

    await view.click(
      screen.getAllByRole("button", {
        name: "Polite",
      })[0],
    );
    expect(onOpen).toHaveBeenCalledWith(historySummary);

    await view.click(screen.getAllByRole("button", { name: "Delete saved lesson" })[0]);
    expect(onDelete).not.toHaveBeenCalled();
    await view.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await view.click(screen.getAllByRole("button", { name: "Delete saved lesson" })[0]);
    await view.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(historySummary.id);
  });

  it("labels Formal and Casual history entries", () => {
    render(
      <HistoryPanel
        entries={[
          { ...historySummary, id: "formal-review", language: "formal" },
          { ...historySummary, id: "formal-b-review", language: "formal" },
          { ...historySummary, id: "casual-review", language: "casual" },
        ]}
        isLoading={false}
        error={null}
        {...actions}
      />,
    );

    expect(screen.getAllByText("Formal").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Casual")).toBeInTheDocument();
  });

  it("stars favorites and lists them above recent reviews", async () => {
    const onStar = vi.fn();
    const view = userEvent.setup();
    const olderFavorite = {
      ...historySummary,
      id: "favorite",
      starred: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    render(
      <HistoryPanel
        entries={[historySummary, olderFavorite]}
        isLoading={false}
        error={null}
        {...actions}
        onStar={onStar}
      />,
    );

    const articles = screen.getAllByRole("article");
    expect(
      within(articles[0]).getByRole("button", {
        name: "Polite",
      }),
    ).toBeInTheDocument();
    expect(
      within(articles[1]).getByRole("button", {
        name: "Polite",
      }),
    ).toBeInTheDocument();
    const favoriteIcon = articles[0].querySelector(
      ".history-card__icon.is-favorite svg",
    );
    expect(favoriteIcon).not.toBeNull();
    expect(favoriteIcon).toHaveAttribute("fill", "none");
    expect(articles[1].querySelector(".history-card__icon.is-favorite")).toBeNull();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();

    await view.click(screen.getByRole("button", { name: "Remove from favorites" }));
    expect(onStar).toHaveBeenCalledWith("favorite", false);
    await view.click(screen.getByRole("button", { name: "Star favorite" }));
    expect(onStar).toHaveBeenCalledWith(historySummary.id, true);
  });

  it("uses the catalog model label on history tags when the saved id is known", () => {
    render(
      <HistoryPanel
        entries={[{ ...historySummary, modelId: REVIEW_CONFIG.model.id }]}
        isLoading={false}
        error={null}
        {...actions}
      />,
    );

    const titles = [
      ...document.querySelectorAll(".history-card__meta span"),
    ].map((tag) => tag.textContent);
    const tags = [
      ...document.querySelectorAll(".history-card__params span"),
    ].map((tag) => tag.textContent);
    expect(titles).toEqual(["Polite"]);
    expect(tags).toContain(REVIEW_CONFIG.model.label);
    expect(tags).toContain("1 lines");
    expect(tags).toContain("4 characters");
    expect(titles).not.toContain(REVIEW_CONFIG.model.id);
    expect(tags).not.toContain(REVIEW_CONFIG.model.id);
  });

  it("shows line and character counts on history tags", () => {
    render(
      <HistoryPanel
        entries={[
          {
            ...historySummary,
            id: "multiline",
            lineCount: 24,
            characterCount: 812,
          },
          {
            ...historySummary,
            id: "unknown-size",
            lineCount: undefined,
            characterCount: undefined,
            modelId: undefined,
            temperature: undefined,
            maxTokens: undefined,
            durationMs: undefined,
          },
        ]}
        isLoading={false}
        error={null}
        {...actions}
      />,
    );

    expect(screen.getByText("24 lines")).toBeInTheDocument();
    expect(screen.getByText("812 characters")).toBeInTheDocument();
    expect(screen.queryByText("1 lines")).not.toBeInTheDocument();
    expect(screen.queryByText("4 characters")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".history-card__params")).toHaveLength(1);
  });

  it("shows the Japanese translation preview", () => {
    render(
      <HistoryPanel
        entries={[
          {
            ...historySummary,
            id: "one",
            translation: "よろしくお願いします。",
          },
        ]}
        isLoading={false}
        error={null}
        {...actions}
      />,
    );

    expect(screen.getAllByText("よろしくお願いします。").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".history-card__translation")).toHaveLength(
      1,
    );
  });
});
