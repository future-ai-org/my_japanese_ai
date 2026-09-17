import { useEffect, useState } from "react";
import { APP_CONFIG, formatElapsedSeconds } from "../config/app";
import { REVIEW_CONFIG, type ReviewModel } from "../config/review";
import { t } from "../i18n/messages";
import type { ModelProgress } from "../services/review";

interface BrowserLoadingStatusProps {
  model?: ReviewModel;
  progress: ModelProgress | null;
}

export function BrowserLoadingStatus({
  model,
  progress,
}: BrowserLoadingStatusProps) {
  const [localElapsed, setLocalElapsed] = useState(0);
  const percent = Math.round((progress?.progress ?? 0) * 100);
  const elapsed =
    progress?.elapsedSeconds && progress.elapsedSeconds > 0
      ? progress.elapsedSeconds
      : localElapsed;

  useEffect(() => {
    const started = performance.now();
    const tick = () => setLocalElapsed((performance.now() - started) / 1000);
    tick();
    const id = window.setInterval(tick, APP_CONFIG.ui.statusTickMs);
    return () => window.clearInterval(id);
  }, []);
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
      <p className="loading-status__hint">{t("browser.loading.hint")}</p>
      <div className="loading-status__facts">
        <span>
          {t("browser.loading.size", {
            size: catalog.downloadSizeMB.toLocaleString(),
          })}
        </span>
        <span>
          {t("provider.cache", {
            vram: catalog.vramRequiredMB.toLocaleString(),
          })}
        </span>
        <span>
          {t("provider.context", {
            size: catalog.contextWindowSize.toLocaleString(),
          })}
        </span>
      </div>
    </div>
  );
}
