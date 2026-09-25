import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "../src/i18n/locale";
import { interpolate, inferenceProviderLabelKey, isLocale, metricLabelKey, translate } from "../src/i18n/messages";

function Toggle() {
  const { locale, setLocale, t } = useLocale();
  return (
    <button type="button" onClick={() => setLocale(locale === "en" ? "ja" : "en")}>
      {t("nav.review")}
    </button>
  );
}

describe("i18n", () => {
  it("translates with interpolation and locale guards", () => {
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(interpolate("Hello {name}", { name: "M" })).toBe("Hello M");
    expect(interpolate("Hello {name}")).toBe("Hello {name}");
    expect(interpolate("Hello {name}", { other: 1 })).toBe("Hello {name}");
    expect(translate("ja", "nav.review")).toBe("レビュー");
    expect(inferenceProviderLabelKey("browser")).toBe("provider.browser");
    expect(inferenceProviderLabelKey("huggingface")).toBe("provider.huggingface");
    expect(inferenceProviderLabelKey("modal")).toBe("provider.modal");
    expect(inferenceProviderLabelKey("custom")).toBeUndefined();
    expect(metricLabelKey("Correctness")).toBe("metrics.correctness");
    expect(metricLabelKey("Security")).toBe("metrics.security");
    expect(metricLabelKey("Maintainability")).toBe("metrics.maintainability");
    expect(metricLabelKey("Reliability")).toBeUndefined();
    expect(translate("ja", "metrics.correctness")).toBe("正確性");
    expect(translate("en", "diagnostics.copy")).toBe("Copy logs");
    expect(translate("en", "provider.huggingface")).toBe("Hugging Face Cloud");
    expect(translate("en", "provider.modal")).toBe("Modal GPU Cloud");
  });

  it("persists the selected locale", async () => {
    window.localStorage.setItem("ai-locale", "en");
    const view = userEvent.setup();
    render(
      <LocaleProvider>
        <Toggle />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Review");
    await view.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("レビュー");
    expect(window.localStorage.getItem("ai-locale")).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("falls back to English translations outside a provider", () => {
    function Probe() {
      const { t } = useLocale();
      return <span>{t("nav.review")}</span>;
    }
    render(<Probe />);
    expect(screen.getByText("Review")).toBeInTheDocument();
  });
});
