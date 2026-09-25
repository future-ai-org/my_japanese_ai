import { useState } from "react";
import { Clipboard, X } from "lucide-react";
import { APP_CONFIG } from "../config/app";
import { useLocale } from "../i18n/locale";
import type { InferenceProvider, ReviewLogEntry } from "../types/review";

interface ModelDiagnosticsProps {
  provider: InferenceProvider;
  entries: ReviewLogEntry[];
  onClose: () => void;
}

function formatDetails(details: unknown): string {
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function serializeEntries(entries: ReviewLogEntry[]): string {
  return entries
    .map((entry) => {
      const prefix =
        `${entry.timestamp} ${entry.level.toUpperCase()} ` +
        `[${entry.stage}] ${entry.message}`;
      return entry.details === undefined
        ? prefix
        : `${prefix}\n${formatDetails(entry.details)}`;
    })
    .join("\n");
}

export function ModelDiagnostics({
  provider,
  entries,
  onClose,
}: ModelDiagnosticsProps) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const title =
    provider === "browser"
      ? t("diagnostics.browserTitle")
      : t("diagnostics.cloudTitle");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(serializeEntries(entries));
    setCopied(true);
    window.setTimeout(() => setCopied(false), APP_CONFIG.ui.copyFeedbackMs);
  };

  return (
    <section className="model-diagnostics" aria-label={title}>
      <div className="model-diagnostics__header">
        <span>{title}</span>
        <div className="model-diagnostics__summary-meta">
          <button
            type="button"
            className="model-diagnostics__copy"
            disabled={entries.length === 0}
            onClick={() => void handleCopy()}
          >
            <Clipboard size={13} />
            {copied ? t("diagnostics.copied") : t("diagnostics.copy")}
          </button>
          <button
            type="button"
            className="model-diagnostics__close"
            aria-label={t("diagnostics.closeAria")}
            onClick={onClose}
          >
            <X size={13} />
            {t("diagnostics.close")}
          </button>
        </div>
      </div>
      <div className="model-diagnostics__toolbar">
        <span>
          {provider === "browser"
            ? t("diagnostics.browserHint")
            : t("diagnostics.cloudHint")}
        </span>
      </div>
      <div className="model-diagnostics__output" aria-live="polite">
        {entries.length === 0 ? (
          <p>{t("diagnostics.empty")}</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className={`log-entry log-entry--${entry.level}`}>
              <div>
                <time dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </time>
                <strong>{entry.level}</strong>
                <span>[{entry.stage}]</span>
                {entry.message}
              </div>
              {entry.details !== undefined && (
                <pre>{formatDetails(entry.details)}</pre>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
