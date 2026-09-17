import { t } from "../i18n/messages";
import { splitLessonParagraphs } from "../shared/review";
import type { ReviewResult } from "../types/review";

interface ReviewResultsProps {
  result: ReviewResult;
  interrupted?: boolean;
}

export function ReviewResults({
  result,
  interrupted = false,
}: ReviewResultsProps) {
  const generating = result.partial && !interrupted;

  return (
    <div className={`results${result.partial ? " is-partial" : ""}`}>
      <section className="translation-card">
        <div className="translation-card__copy">
          <span className="eyebrow">
            {interrupted
              ? t("results.interrupted")
              : result.partial
                ? t("editor.reviewing")
                : t("translation.complete")}
          </span>
          <h2>{t("translation.title")}</h2>
          {result.translation ? (
            <p className="translation-card__japanese">{result.translation}</p>
          ) : result.partial ? (
            <p>{t("results.reviewingBody")}</p>
          ) : null}
        </div>
      </section>

      {result.lesson ? (
        <section className="review-lesson">
          <div className="section-heading">
            <h2>{t("lesson.title")}</h2>
          </div>
          <div className="review-lesson__body">
            {splitLessonParagraphs(result.lesson).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : generating ? (
        <section className="review-lesson review-lesson--pending">
          <div className="section-heading">
            <h2>{t("lesson.title")}</h2>
          </div>
          <p className="generating-placeholder">{t("lesson.generating")}</p>
        </section>
      ) : result.translation && !interrupted ? (
        <section className="review-lesson review-lesson--pending">
          <div className="section-heading">
            <h2>{t("lesson.title")}</h2>
          </div>
          <p className="generating-placeholder">{t("lesson.missing")}</p>
        </section>
      ) : null}
    </div>
  );
}
