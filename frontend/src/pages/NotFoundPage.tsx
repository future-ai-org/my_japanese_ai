import { Link } from "react-router-dom";
import { paths } from "../docs/paths";
import { useLocale } from "../i18n/locale";

export function NotFoundPage() {
  const { t } = useLocale();
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
