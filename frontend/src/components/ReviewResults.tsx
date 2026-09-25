import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleAlert,
  Lightbulb,
} from "lucide-react";
import { APP_CONFIG } from "../config/app";
import { useLocale } from "../i18n/locale";
import { metricLabelKey, type MessageKey } from "../i18n/messages";
import { scoreBand } from "../review/score";
import type {
  ReviewFinding,
  ReviewResult,
  Severity,
} from "../types/review";

interface ReviewResultsProps {
  result: ReviewResult;
  selectedFinding: string | null;
  interrupted?: boolean;
  onSelectFinding: (finding: ReviewFinding) => void;
}

const SEVERITY_CONFIG: Record<
  Severity,
  { labelKey: MessageKey; icon: typeof CircleAlert }
> = {
  critical: { labelKey: "findings.critical", icon: CircleAlert },
  warning: { labelKey: "findings.warning", icon: AlertCircle },
  suggestion: { labelKey: "findings.suggestion", icon: Lightbulb },
};

const SCORE_HEADING: Record<ReturnType<typeof scoreBand>, MessageKey> = {
  strong: "score.heading.strong",
  good: "score.heading.good",
  fair: "score.heading.fair",
  poor: "score.heading.poor",
  critical: "score.heading.critical",
};

function formatTraceValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ReviewResults({
  result,
  selectedFinding,
  interrupted = false,
  onSelectFinding,
}: ReviewResultsProps) {
  const { t } = useLocale();
  const band = scoreBand(result.score);
  const generating = result.partial && !interrupted;
  const showMetrics = result.metrics.length > 0;
  const showFindings = !result.partial || result.findings.length > 0;

  return (
    <div className={`results${result.partial ? " is-partial" : ""}`}>
      <section className={`score-card score-card--${band}`}>
        <div
          className="score-ring"
          style={{ "--score": result.score } as React.CSSProperties}
        >
          <div>
            <strong>{result.score}</strong>
            <span>/ {APP_CONFIG.score.max}</span>
          </div>
        </div>
        <div className="score-card__copy">
          <span className="eyebrow">
            {interrupted
              ? t("results.interrupted")
              : result.partial
                ? t("editor.reviewing")
                : t("score.complete")}
          </span>
          <h2>{t(SCORE_HEADING[band])}</h2>
          {result.summary ? (
            <p>{result.summary}</p>
          ) : result.partial ? (
            <p>{t("results.reviewingBody")}</p>
          ) : null}
        </div>
      </section>

      {showMetrics ? (
        <section className="metrics" aria-label={t("metrics.label")}>
          {result.metrics.map((metric) => {
            const labelKey = metricLabelKey(metric.label);
            return (
              <div
                className={`metric metric--${scoreBand(metric.score)}`}
                key={metric.label}
              >
                <div className="metric__label">
                  <span>{labelKey ? t(labelKey) : metric.label}</span>
                  <strong>{metric.score}</strong>
                </div>
                <div className="metric__track">
                  <span style={{ width: `${metric.score}%` }} />
                </div>
                {metric.description ? (
                  <p className="metric__description">{metric.description}</p>
                ) : null}
                {metric.snippet && (
                  <pre className="metric__snippet">
                    <code>{metric.snippet}</code>
                  </pre>
                )}
              </div>
            );
          })}
        </section>
      ) : generating ? (
        <section className="metrics metrics--pending" aria-label={t("metrics.label")}>
          <p className="generating-placeholder">{t("metrics.generating")}</p>
        </section>
      ) : null}

      {result.rationale && (
        <section className="review-rationale">
          <div className="section-heading">
            <h2>{t("rationale.title")}</h2>
          </div>
          <p>{result.rationale}</p>
        </section>
      )}

      {showFindings ? (
        <section>
          <div className="section-heading">
            <h2>{t("findings.title")}</h2>
            <span>{t("findings.count", { count: result.findings.length })}</span>
          </div>
          <div className="finding-list">
            {result.findings.map((finding) => {
              const config = SEVERITY_CONFIG[finding.severity];
              const Icon = config.icon;
              const isSelected = selectedFinding === finding.id;

              return (
                <button
                  className={`finding finding--${finding.severity}${isSelected ? " is-selected" : ""}`}
                  key={finding.id}
                  onClick={() => onSelectFinding(finding)}
                  type="button"
                >
                  <span className="finding__icon">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="finding__body">
                    <span className="finding__meta">
                      {t(config.labelKey)} · {t("findings.line", { line: finding.line })}
                    </span>
                    <strong>{finding.title}</strong>
                    <span className="finding__description">
                      {finding.description}
                    </span>
                    {finding.suggestion && (
                      <code>
                        <Check size={13} /> {finding.suggestion}
                      </code>
                    )}
                  </span>
                  <ChevronRight className="finding__chevron" size={17} />
                </button>
              );
            })}
          </div>
        </section>
      ) : generating ? (
        <section>
          <div className="section-heading">
            <h2>{t("findings.title")}</h2>
          </div>
          <p className="generating-placeholder">{t("findings.generating")}</p>
        </section>
      ) : null}

      {result.inference && !result.partial && (
        <details className="inference-trace">
          <summary>{t("trace.summary")}</summary>
          <div className="inference-trace__content">
            <h3>{t("trace.model")}</h3>
            <pre>
              {formatTraceValue({
                provider: result.inference.provider,
                modelId: result.inference.modelId,
                startedAt: result.inference.startedAt,
                completedAt: result.inference.completedAt,
                finishReason: result.inference.finishReason,
                generationConfig: result.inference.generationConfig,
                usage: result.inference.usage,
              })}
            </pre>

            <h3>{t("trace.system")}</h3>
            <pre>{result.inference.systemPrompt}</pre>

            <h3>{t("trace.user")}</h3>
            <pre>{result.inference.userPrompt}</pre>

            <h3>{t("trace.schema")}</h3>
            <pre>{formatTraceValue(result.inference.responseSchema)}</pre>

            <h3>{t("trace.raw")}</h3>
            <pre>{result.inference.rawOutput}</pre>

            <h3>{t("trace.runtime")}</h3>
            <pre>{result.inference.runtimeStats ?? t("trace.unavailable")}</pre>

            <h3>{t("trace.logs")}</h3>
            <pre>{formatTraceValue(result.inference.logs)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
