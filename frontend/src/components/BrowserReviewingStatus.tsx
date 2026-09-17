import { useEffect, useState } from "react";
import { APP_CONFIG, formatElapsedSeconds } from "../config/app";
import { REVIEW_CONFIG, type ReviewModel } from "../config/review";
import { t } from "../i18n/messages";
import { browserReviewingPhase } from "../review/browserReviewing";
import type { ModelProgress } from "../services/review";

interface BrowserReviewingStatusProps {
  model?: ReviewModel;
  progress: ModelProgress | null;
  languageLabel: string;
  lineCount: number;
  characterCount: number;
  temperature: number;
}

function formatSeconds(value: number): string {
  return formatElapsedSeconds(value);
}

export function BrowserReviewingStatus({
  model,
  progress,
  languageLabel,
  lineCount,
  characterCount,
  temperature,
}: BrowserReviewingStatusProps) {
  const [localElapsed, setLocalElapsed] = useState(0);
  const elapsed =
    progress?.elapsedSeconds && progress.elapsedSeconds > 0
      ? progress.elapsedSeconds
      : localElapsed;
  const phase = browserReviewingPhase(elapsed, progress);
  const catalog = model ?? REVIEW_CONFIG.model;

  useEffect(() => {
    const started = performance.now();
    const tick = () => setLocalElapsed((performance.now() - started) / 1000);
    tick();
    const id = window.setInterval(tick, APP_CONFIG.ui.statusTickMs);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="loading-status" role="status">
      <div className="loading-status__meta">
        <strong>
          {t("browser.loading.elapsed", { seconds: formatSeconds(elapsed) })}
        </strong>
        <span>{catalog.label}</span>
      </div>
      <p className="loading-status__hint">
        {phase === "generate" || phase === "validate"
          ? t("browser.reviewing.hint.generate")
          : t("browser.reviewing.hint")}
      </p>
      <div className="loading-status__facts">
        <span>{languageLabel}</span>
        <span>
          {t("editor.size", {
            lines: lineCount.toLocaleString(),
            characters: characterCount.toLocaleString(),
          })}
        </span>
        <span>
          {t("provider.context", {
            size: catalog.contextWindowSize.toLocaleString(),
          })}
        </span>
        <span>
          {t("history.temp", {
            value: temperature,
          })}
        </span>
      </div>
    </div>
  );
}
