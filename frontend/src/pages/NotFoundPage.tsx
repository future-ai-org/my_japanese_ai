import { Link } from "react-router-dom";
import { paths } from "../docs/paths";
import { t } from "../i18n/messages";

export function NotFoundPage() {
  return (
    <section className="error-view" aria-labelledby="not-found-title">
      <h1 id="not-found-title">{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link className="run-button" to={paths.review}>
        {t("notFound.home")}
      </Link>
    </section>
  );
}
