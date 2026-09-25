import { useEffect, useState } from "react";
import { APP_CONFIG, formatElapsedSeconds } from "../config/app";
import { REVIEW_CONFIG, type ReviewModel } from "../config/review";
import { useLocale } from "../i18n/locale";
import type { MessageKey } from "../i18n/messages";
import { recentActivityLogs } from "../review/activityLog";
import {
  browserReviewingPhase,
  isBrowserReviewActivityLog,
  type BrowserReviewingPhase,
} from "../review/browserReviewing";
import type { ModelProgress } from "../services/review";
import type { ReviewLogEntry } from "../types/review";

const PHASE_MESSAGE: Record<BrowserReviewingPhase, MessageKey> = {
  submit: "browser.reviewing.phase.submit",
  prefill: "browser.reviewing.phase.prefill",
  generate: "browser.reviewing.phase.generate",
  validate: "browser.reviewing.phase.validate",
};

interface BrowserReviewingStatusProps {
  model?: ReviewModel;
  progress: ModelProgress | null;
  logs: ReviewLogEntry[];
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
  logs,
  languageLabel,
  lineCount,
  characterCount,
  temperature,
}: BrowserReviewingStatusProps) {
  const { t } = useLocale();
  const [localElapsed, setLocalElapsed] = useState(0);
  const elapsed =
    progress?.elapsedSeconds && progress.elapsedSeconds > 0
      ? progress.elapsedSeconds
      : localElapsed;
  const phase = browserReviewingPhase(elapsed, progress);
  const catalog = model ?? REVIEW_CONFIG.model;
  const activity = recentActivityLogs(
    logs,
    isBrowserReviewActivityLog,
    APP_CONFIG.ui.activityLogLimit,
  );

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
      <p className="loading-status__phase">{t(PHASE_MESSAGE[phase])}</p>
      {progress?.text &&
      phase !== "prefill" &&
      progress.text !== t(PHASE_MESSAGE[phase]) &&
      progress.text !== t("browser.reviewing") ? (
        <p className="loading-status__detail">{progress.text}</p>
      ) : null}
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
          {t("provider.modelId", {
            id: catalog.id,
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
      {activity.length > 0 ? (
        <ol
          className="loading-status__activity"
          aria-label={t("browser.reviewing.activity")}
        >
          {activity.map((entry) => (
            <li key={entry.id}>
              <span>{entry.stage}</span>
              {entry.message}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
