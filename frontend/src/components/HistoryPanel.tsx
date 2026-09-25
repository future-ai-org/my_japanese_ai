import { useState } from "react";
import { Clock3, Code2, LoaderCircle, Star, Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { reviewModelForRuntimeId } from "../config/review";
import { LANGUAGE_LABELS } from "../data/examples";
import { useLocale } from "../i18n/locale";
import { scoreBand } from "../review/score";
import type { InferenceProvider, ReviewHistorySummary } from "../types/review";

interface HistoryPanelProps {
  entries: ReviewHistorySummary[];
  isLoading: boolean;
  error: string | null;
  onOpen: (entry: ReviewHistorySummary) => void;
  onStar: (id: string, starred: boolean) => void;
  onDelete: (id: string) => void;
}

const INFERENCE_KEYS: Record<InferenceProvider, "history.browser" | "history.modal" | "history.huggingface" | "history.custom"> = {
  browser: "history.browser",
  modal: "history.modal",
  huggingface: "history.huggingface",
  custom: "history.custom",
};

export function HistoryPanel({
  entries,
  isLoading,
  error,
  onOpen,
  onStar,
  onDelete,
}: HistoryPanelProps) {
  const { locale, t } = useLocale();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "ja" ? "ja-JP" : undefined,
    { dateStyle: "medium", timeStyle: "short" },
  );
  const starredEntries = entries.filter((entry) => entry.starred);
  const recentEntries = entries.filter((entry) => !entry.starred);

  const inferenceLabel = (entry: ReviewHistorySummary): string => {
    if (!entry.provider) return t("history.browser");
    const key = INFERENCE_KEYS[entry.provider as InferenceProvider];
    return key ? t(key) : entry.provider;
  };

  const modelLabel = (entry: ReviewHistorySummary): string | undefined => {
    const labeled = reviewModelForRuntimeId(entry.modelId)?.label;
    if (labeled) return labeled;
    return entry.modelId || undefined;
  };

  const identityLabels = (entry: ReviewHistorySummary): string[] => {
    const labels = [inferenceLabel(entry)];
    const language = LANGUAGE_LABELS[entry.language];
    if (language) labels.push(language);
    return labels;
  };

  const parameterLabels = (entry: ReviewHistorySummary): string[] => {
    const labels: string[] = [];
    if (typeof entry.lineCount === "number") {
      labels.push(
        t("history.lines", { value: entry.lineCount.toLocaleString() }),
      );
    }
    if (typeof entry.characterCount === "number") {
      labels.push(
        t("history.characters", {
          value: entry.characterCount.toLocaleString(),
        }),
      );
    }
    const model = modelLabel(entry);
    if (model) labels.push(model);
    if (typeof entry.temperature === "number") {
      labels.push(t("history.temp", { value: entry.temperature }));
    }
    if (typeof entry.maxTokens === "number") {
      labels.push(
        t("history.tokens", { value: entry.maxTokens.toLocaleString() }),
      );
    }
    if (typeof entry.durationMs === "number") {
      labels.push(
        t("history.inferenceTime", {
          seconds: (entry.durationMs / 1000).toFixed(1),
        }),
      );
    }
    return labels;
  };

  const renderEntry = (entry: ReviewHistorySummary) => {
    const titleParts = identityLabels(entry);
    const params = parameterLabels(entry);
    return (
      <article
        className={`history-card${entry.starred ? " is-starred" : ""}`}
        key={entry.id}
      >
        <button
          className="history-card__open"
          type="button"
          aria-label={titleParts.join(" ")}
          onClick={() => onOpen(entry)}
        >
          <div
            className={`history-card__icon${entry.starred ? " is-favorite" : ""}`}
          >
            {entry.starred ? (
              <Star size={17} fill="none" />
            ) : (
              <Code2 size={17} />
            )}
          </div>
          <div className="history-card__body">
            <div className="history-card__meta">
              {titleParts.map((label, index) => (
                <span key={`${index}-${label}`}>{label}</span>
              ))}
              <time dateTime={entry.createdAt}>
                {dateFormatter.format(new Date(entry.createdAt))}
              </time>
            </div>
            {params.length > 0 && (
              <div className="history-card__params">
                {params.map((label, index) => (
                  <span key={`${index}-${label}`}>{label}</span>
                ))}
              </div>
            )}
          </div>
          <div
            className={`history-score history-score--${scoreBand(entry.score)}`}
          >
            <strong>{entry.score}</strong>
            <span>{t("history.score")}</span>
          </div>
        </button>
        <div className="history-card__actions">
          <button
            className={`history-card__star${entry.starred ? " is-active" : ""}`}
            type="button"
            aria-label={
              entry.starred ? t("history.unstar") : t("history.star")
            }
            aria-pressed={entry.starred}
            title={entry.starred ? t("history.unstar") : t("history.star")}
            onClick={() => onStar(entry.id, !entry.starred)}
          >
            <Star size={15} fill={entry.starred ? "currentColor" : "none"} />
          </button>
          <button
            className="history-card__delete"
            type="button"
            aria-label={t("history.delete")}
            title={t("history.delete")}
            onClick={() => setPendingDeleteId(entry.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="history-library">
      {error && <div className="history-error">{error}</div>}

      {isLoading && entries.length === 0 ? (
        <div className="history-empty">
          <LoaderCircle className="spin" size={24} />
          <p>{t("history.loading")}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="history-empty">
          <Clock3 size={29} strokeWidth={1.4} />
          <h2>{t("history.emptyTitle")}</h2>
        </div>
      ) : (
        <div className="history-list">
          {starredEntries.length > 0 && (
            <section
              className="history-group"
              aria-label={t("history.favorites")}
            >
              <h2 className="history-group__title">{t("history.favorites")}</h2>
              {starredEntries.map(renderEntry)}
            </section>
          )}
          {recentEntries.length > 0 && (
            <section
              className="history-group"
              aria-label={
                starredEntries.length > 0 ? t("history.recent") : undefined
              }
            >
              {starredEntries.length > 0 && (
                <h2 className="history-group__title">{t("history.recent")}</h2>
              )}
              {recentEntries.map(renderEntry)}
            </section>
          )}
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title={t("history.confirmTitle")}
          body={t("history.confirmBody")}
          confirmLabel={t("history.confirm")}
          cancelLabel={t("history.cancel")}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            onDelete(id);
          }}
        />
      )}
    </div>
  );
}
