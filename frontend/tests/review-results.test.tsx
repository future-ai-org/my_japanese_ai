import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewResults } from "../src/components/ReviewResults";
import { LocaleProvider } from "../src/i18n/locale";
import { reviewResult } from "./fixtures";

describe("ReviewResults", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("localizes metric labels when the UI locale is Japanese", () => {
    window.localStorage.setItem("ai-locale", "ja");
    render(
      <LocaleProvider>
        <ReviewResults
          selectedFinding={null}
          onSelectFinding={vi.fn()}
          result={{
            score: 88,
            summary: "Solid work",
            findings: [],
            durationMs: 1,
            metrics: [
              { label: "Correctness", score: 90 },
              { label: "Security", score: 70 },
              { label: "Maintainability", score: 80 },
            ],
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("正確性")).toBeInTheDocument();
    expect(screen.getByText("セキュリティ")).toBeInTheDocument();
    expect(screen.getByText("保守性")).toBeInTheDocument();
    expect(screen.getByText("Solid work")).toBeInTheDocument();
  });
  it("renders metrics, findings, rationale, and the inference trace", async () => {
    const onSelectFinding = vi.fn();
    const view = userEvent.setup();
    const circular: { self?: unknown } = {};
    circular.self = circular;

    render(
      <ReviewResults
        selectedFinding="f1"
        onSelectFinding={onSelectFinding}
        result={{
          ...reviewResult,
          inference: {
            ...reviewResult.inference!,
            usage: circular,
            runtimeStats: undefined,
            logs: "plain log" as unknown as typeof reviewResult.inference.logs,
          },
        }}
      />,
    );

    expect(screen.getByText("Solid work")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Good foundation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diagnostic Logs" })).toBeInTheDocument();
    expect(screen.getByText("Behavior is sound.")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "How well the code avoids exploitable behavior and unsafe data handling.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("The model's assessment of this quality area."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("The function returns a value.")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();

    const metrics = [...document.querySelectorAll(".metric")];
    expect(metrics.map((metric) => [...metric.classList])).toEqual([
      ["metric", "metric--strong"],
      ["metric", "metric--good"],
      ["metric", "metric--fair"],
    ]);

    await view.click(screen.getByRole("button", { name: /Null crash/ }));
    expect(onSelectFinding).toHaveBeenCalledWith(reviewResult.findings[0]);
    expect(screen.getByText("Handle null")).toBeInTheDocument();
    expect(screen.getByText("Rename helper")).toBeInTheDocument();
  });

  it("omits optional sections when the review has no extras", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 10,
          summary: "Needs work",
          findings: [],
          metrics: [],
          durationMs: 1,
        }}
      />,
    );

    expect(screen.queryByText("Model rationale")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete inference trace")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Critical problems" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs work")).toBeInTheDocument();
  });

  it("hides an empty summary on a finished review", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 10,
          summary: "",
          findings: [],
          metrics: [],
          durationMs: 1,
        }}
      />,
    );

    expect(screen.queryByText("Reviewing…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading and generating…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Looking for risks, edge cases, and improvements…"),
    ).not.toBeInTheDocument();
  });

  it("renders finished sections while the rest of the review is still streaming", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 88,
          summary: "",
          metrics: [],
          findings: [],
          durationMs: 20,
          partial: true,
          inference: reviewResult.inference,
        }}
      />,
    );

    expect(screen.getByText("Reviewing…")).toBeInTheDocument();
    expect(
      screen.getByText("Looking for risks, edge cases, and improvements…"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading and generating…")).not.toBeInTheDocument();
    expect(screen.getByText("Generating metrics…")).toBeInTheDocument();
    expect(screen.getByText("Generating diagnostic logs…")).toBeInTheDocument();
    expect(screen.queryByText("Complete inference trace")).not.toBeInTheDocument();
  });

  it("labels an interrupted partial review instead of still reviewing", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        interrupted
        result={{
          score: 88,
          summary: "Solid work",
          metrics: [],
          findings: [],
          durationMs: 20,
          partial: true,
        }}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByText("Reviewing…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading and generating…")).not.toBeInTheDocument();
    expect(screen.getByText("Solid work")).toBeInTheDocument();
  });

  it("keeps section placeholders after metrics arrive while findings are still streaming", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 88,
          summary: "Solid work",
          metrics: [{ label: "Correctness", score: 90 }],
          findings: [],
          durationMs: 20,
          partial: true,
        }}
      />,
    );

    expect(screen.queryByText("Loading and generating…")).not.toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText("Generating metrics…")).not.toBeInTheDocument();
    expect(screen.getByText("Generating diagnostic logs…")).toBeInTheDocument();
  });

  it("colors each metric by the same score bands as the overall grade", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 88,
          summary: "Solid work",
          findings: [],
          durationMs: 1,
          metrics: [
            { label: "Correctness", score: 94 },
            { label: "Security", score: 72 },
            { label: "Maintainability", score: 12 },
          ],
        }}
      />,
    );

    const metrics = [...document.querySelectorAll(".metric")];
    expect(metrics.map((metric) => [...metric.classList])).toEqual([
      ["metric", "metric--strong"],
      ["metric", "metric--fair"],
      ["metric", "metric--critical"],
    ]);
  });

  it("shows only the model's explanation for why each metric score was given", () => {
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 70,
          summary: "Mixed quality",
          findings: [],
          durationMs: 1,
          metrics: [
            {
              label: "Correctness",
              score: 82,
              description:
                "process() returns the parsed integer on the happy path.\nEmpty input still raises ValueError before the caller can recover.\nThe remaining branches are untested, so the score is 82 rather than higher.",
            },
            {
              label: "Security",
              score: 40,
              description:
                "The handler interpolates request.path into a shell command.\nThere is no sanitization or allowlist on that path value.\nThat is command injection, so the score is 40.",
            },
            {
              label: "Maintainability",
              score: 61,
              description:
                "Helpers are named clearly and grouped by responsibility.\nThere are no tests around timeout or empty-input recovery.\nA reader can follow the flow, but changes would be risky, so the score is 61.",
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText(
        "process() returns the parsed integer on the happy path. Empty input still raises ValueError before the caller can recover. The remaining branches are untested, so the score is 82 rather than higher.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The handler interpolates request.path into a shell command. There is no sanitization or allowlist on that path value. That is command injection, so the score is 40.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Helpers are named clearly and grouped by responsibility. There are no tests around timeout or empty-input recovery. A reader can follow the flow, but changes would be risky, so the score is 61.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "How reliably the code behaves as intended and handles edge cases.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "How well the code avoids exploitable behavior and unsafe data handling.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "How easy the code is to understand, change, test, and extend.",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps a long metric snippet inside the snippet box", () => {
    const snippet =
      "payload = {'amount': amount, 'currency': order.get('currency', 'usd'), 'card': customer['cards'][0]['token'], 'idempotency_key': key}";
    render(
      <ReviewResults
        selectedFinding={null}
        onSelectFinding={vi.fn()}
        result={{
          score: 70,
          summary:
            "The code appears to follow correct logic for fetching customer details and generating payment payloads. However, the format of the `payload` is inconsistent and lacks proper validation.",
          findings: [],
          durationMs: 1,
          metrics: [
            {
              label: "Correctness",
              score: 72,
              description:
                "The payload is assembled from the order and the first saved card token.",
              snippet,
            },
          ],
        }}
      />,
    );

    const box = document.querySelector(".metric__snippet");
    expect(box).toHaveTextContent(snippet);
    expect(box?.parentElement).toHaveClass("metric");
  });
});
