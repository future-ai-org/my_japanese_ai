import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewResults } from "../src/components/ReviewResults";
import { reviewResult } from "./fixtures";

describe("ReviewResults", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders the Japanese translation and English lesson", () => {
    render(
      <ReviewResults
        result={{
          translation: "よろしくお願いします。",
          lesson:
            "Start in the polite register.|||Key words include よろしく (yoroshiku) and お願いします (onegaishimasu).|||Close with a soft request rather than a command.",
          durationMs: 1,
        }}
      />,
    );

    expect(screen.getByText("よろしくお願いします。")).toBeInTheDocument();
    expect(screen.getByText("Start in the polite register.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Key words include よろしく (yoroshiku) and お願いします (onegaishimasu).",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Close with a soft request rather than a command."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Japanese translation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How to translate it" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Phrase notes" })).not.toBeInTheDocument();
  });

  it("renders translation and lesson without an inference trace", () => {
    render(<ReviewResults result={reviewResult} />);

    expect(screen.getByText("よろしくお願いします。")).toBeInTheDocument();
    expect(
      screen.getByText(
        "For polite register, よろしくお願いします is the natural closing when asking for someone's consideration.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Complete inference trace")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Phrase notes" })).not.toBeInTheDocument();
  });

  it("shows a missing-lesson hint when translation arrived without a lesson", () => {
    render(
      <ReviewResults
        result={{
          translation: "こんにちは。",
          lesson: "",
          durationMs: 1,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "How to translate it" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The model finished without a lesson. Try again with a longer output length.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("こんにちは。")).toBeInTheDocument();
  });

  it("hides an empty translation on a finished review", () => {
    render(
      <ReviewResults
        result={{
          translation: "",
          lesson: "",
          durationMs: 1,
        }}
      />,
    );

    expect(screen.queryByText("Teaching…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Building a Japanese translation and teaching notes…"),
    ).not.toBeInTheDocument();
  });

  it("renders finished sections while the rest of the review is still streaming", () => {
    render(
      <ReviewResults
        result={{
          translation: "",
          lesson: "",
          durationMs: 20,
          partial: true,
          inference: reviewResult.inference,
        }}
      />,
    );

    expect(screen.getByText("Teaching…")).toBeInTheDocument();
    expect(
      screen.getByText("Building a Japanese translation and teaching notes…"),
    ).toBeInTheDocument();
    expect(screen.getByText("Writing the lesson…")).toBeInTheDocument();
    expect(screen.queryByText("Generating phrase notes…")).not.toBeInTheDocument();
  });

  it("labels an interrupted partial review instead of still reviewing", () => {
    render(
      <ReviewResults
        interrupted
        result={{
          translation: "よろしくお願いします。",
          lesson: "",
          durationMs: 20,
          partial: true,
        }}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByText("Teaching…")).not.toBeInTheDocument();
    expect(screen.getByText("よろしくお願いします。")).toBeInTheDocument();
  });

  it("shows the lesson once it arrives while still streaming", () => {
    render(
      <ReviewResults
        result={{
          translation: "よろしくお願いします。",
          lesson: "Use a polite closing.",
          durationMs: 20,
          partial: true,
        }}
      />,
    );

    expect(screen.getByText("Use a polite closing.")).toBeInTheDocument();
    expect(screen.queryByText("Writing the lesson…")).not.toBeInTheDocument();
    expect(screen.queryByText("Generating phrase notes…")).not.toBeInTheDocument();
  });
});
