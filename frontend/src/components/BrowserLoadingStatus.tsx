import { useEffect, useState } from "react";
import { APP_CONFIG, formatElapsedSeconds } from "../config/app";
import { REVIEW_CONFIG, type ReviewModel } from "../config/review";
import { useLocale } from "../i18n/locale";
import type { MessageKey } from "../i18n/messages";
import { recentActivityLogs } from "../review/activityLog";
import {
  browserLoadingPhase,
  isBrowserLoadingActivityLog,
} from "../review/loadingPhase";
import type { ModelProgress } from "../services/review";
import type { ReviewLogEntry } from "../types/review";

const PHASE_MESSAGE: Record<
  Exclude<ReturnType<typeof browserLoadingPhase>, "other">,
  MessageKey
> = {
  storage: "browser.loading.phase.storage",
  gpu: "browser.loading.phase.gpu",
  download: "browser.loading.phase.download",
  cache: "browser.loading.phase.cache",
  weights: "browser.loading.phase.weights",
  shaders: "browser.loading.phase.shaders",
  ready: "browser.loading.phase.ready",
};

interface BrowserLoadingStatusProps {
  model?: ReviewModel;
  progress: ModelProgress | null;
  logs: ReviewLogEntry[];
}

export function BrowserLoadingStatus({
  model,
  progress,
  logs,
}: BrowserLoadingStatusProps) {
  const { t } = useLocale();
  const [localElapsed, setLocalElapsed] = useState(0);
  const percent = Math.round((progress?.progress ?? 0) * 100);
  const elapsed =
    progress?.elapsedSeconds && progress.elapsedSeconds > 0
      ? progress.elapsedSeconds
      : localElapsed;
  const phase = browserLoadingPhase(progress?.text ?? "");
  const phaseLabel =
    phase === "other"
      ? progress?.text || t("browser.preparing")
      : t(PHASE_MESSAGE[phase]);

  useEffect(() => {
    const started = performance.now();
    const tick = () => setLocalElapsed((performance.now() - started) / 1000);
    tick();
    const id = window.setInterval(tick, APP_CONFIG.ui.statusTickMs);
    return () => window.clearInterval(id);
  }, []);
  const activity = recentActivityLogs(
    logs,
    isBrowserLoadingActivityLog,
    APP_CONFIG.ui.activityLogLimit,
  );
  const catalog = model ?? REVIEW_CONFIG.model;

  return (
    <div className="loading-status" role="status">
      <div className="loading-status__meta">
        <strong>{t("browser.loading.percent", { percent })}</strong>
        <span>
          {t("browser.loading.elapsed", {
            seconds: formatElapsedSeconds(elapsed),
          })}
        </span>
      </div>
      <p className="loading-status__phase">{phaseLabel}</p>
      <p className="loading-status__hint">{t("browser.loading.hint")}</p>
      <div className="loading-status__facts">
        <span>
          {t("browser.loading.size", {
            size: catalog.downloadSizeMB.toLocaleString(),
          })}
        </span>
        <span>
          {t("provider.cache", {
            cache: REVIEW_CONFIG.storage.cacheBackend,
            vram: catalog.vramRequiredMB.toLocaleString(),
          })}
        </span>
        <span>
          {t("provider.context", {
            size: catalog.contextWindowSize.toLocaleString(),
          })}
        </span>
      </div>
      {activity.length > 0 ? (
        <ol className="loading-status__activity" aria-label={t("browser.loading.activity")}>
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
