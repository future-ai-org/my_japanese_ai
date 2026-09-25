import { useEffect, useState } from "react";
import { APP_CONFIG, formatElapsedSeconds } from "../config/app";
import { useLocale } from "../i18n/locale";
import { inferenceProviderLabelKey, type MessageKey } from "../i18n/messages";
import { recentActivityLogs } from "../review/activityLog";
import {
  cloudActivityStage,
  cloudConnectingPhase,
  isCloudActivityLog,
  type CloudConnectingPhase,
} from "../review/cloudConnecting";
import type { ModelProgress } from "../services/review";
import type { InferenceProviderInfo, ReviewLogEntry } from "../types/review";
import { HelpTip } from "./HelpTip";

const PHASE_MESSAGE: Record<CloudConnectingPhase, MessageKey> = {
  connect: "cloud.connecting.phase.connect",
  wait: "cloud.connecting.phase.wait",
  boot: "cloud.connecting.phase.boot",
};

interface CloudConnectingStatusProps {
  provider?: InferenceProviderInfo;
  progress: ModelProgress | null;
  logs: ReviewLogEntry[];
  starting?: boolean;
}

function formatSeconds(value: number): string {
  return formatElapsedSeconds(value);
}

export function CloudConnectingStatus({
  provider,
  progress,
  logs,
  starting = false,
}: CloudConnectingStatusProps) {
  const { t } = useLocale();
  const [localElapsed, setLocalElapsed] = useState(0);
  const elapsed =
    progress?.elapsedSeconds && progress.elapsedSeconds > 0
      ? progress.elapsedSeconds
      : localElapsed;
  const timeoutSeconds = provider ? provider.timeoutMs / 1000 : 0;
  const remaining = timeoutSeconds > 0 ? Math.max(0, timeoutSeconds - elapsed) : 0;
  const overtime = timeoutSeconds > 0 && elapsed >= timeoutSeconds;
  const percent =
    timeoutSeconds > 0
      ? Math.min(100, Math.round((elapsed / timeoutSeconds) * 100))
      : 0;
  const phase = cloudConnectingPhase(elapsed, starting);
  const activity = recentActivityLogs(
    logs,
    isCloudActivityLog,
    APP_CONFIG.ui.activityLogLimit,
  );
  const providerLabelKey = provider
    ? inferenceProviderLabelKey(provider.id)
    : undefined;
  const providerLabel = provider
    ? providerLabelKey
      ? t(providerLabelKey)
      : provider.label
    : undefined;

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
          {t("cloud.connecting.elapsed", { seconds: formatSeconds(elapsed) })}
        </strong>
        {timeoutSeconds > 0 ? (
          <span>
            {overtime
              ? t("cloud.connecting.overtime")
              : t("cloud.connecting.remaining", {
                  seconds: formatSeconds(remaining),
                })}
          </span>
        ) : null}
      </div>
      {timeoutSeconds > 0 ? (
        <div
          className="model-progress"
          role="progressbar"
          aria-label={t("cloud.connecting")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <p className="loading-status__phase">{t(PHASE_MESSAGE[phase])}</p>
      {progress?.text && progress.text !== t("cloud.connecting") ? (
        <p className="loading-status__detail">{progress.text}</p>
      ) : null}
      <p className="loading-status__hint">
        {starting ? t("cloud.connecting.hint.boot") : t("cloud.connecting.hint")}
      </p>
      {provider && providerLabel ? (
        <div className="loading-status__facts">
          <span>{providerLabel}</span>
          <HelpTip
            id="connecting-model-help"
            className="provider-summary__fact"
            tabIndex={0}
            help={t("provider.modelId.help")}
          >
            {t("provider.modelId", {
              id: provider.modelId,
            })}
          </HelpTip>
          <HelpTip
            id="connecting-timeout-help"
            className="provider-summary__fact"
            tabIndex={0}
            help={t("provider.timeout.help")}
          >
            {t("provider.timeout", {
              seconds: timeoutSeconds.toLocaleString(),
            })}
          </HelpTip>
          <HelpTip
            id="connecting-quota-help"
            className="provider-summary__fact"
            tabIndex={0}
            help={t("provider.quota.help")}
          >
            {t("provider.quota", {
              count: provider.requestsPerWindow,
              minutes: provider.rateLimitWindowMinutes,
            })}
          </HelpTip>
        </div>
      ) : null}
      {activity.length > 0 ? (
        <ol
          className="loading-status__activity"
          aria-label={t("cloud.connecting.activity")}
        >
          {activity.map((entry) => (
            <li key={entry.id}>
              <span>{cloudActivityStage(entry.stage)}</span>
              {entry.message}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
