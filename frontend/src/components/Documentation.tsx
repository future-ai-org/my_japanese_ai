import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MarkdownDoc } from "../docs/MarkdownDoc";
import {
  DOC_PAGES,
  type DocPage,
  docNavTree,
  getAdjacentDocPages,
  getDocPage,
} from "../docs/pages";
import { docPath } from "../docs/paths";
import { useLocale } from "../i18n/locale";
import { NotFoundPage } from "../pages/NotFoundPage";

function DocsPager({
  previous,
  next,
  onNavigate,
}: {
  previous: DocPage | null;
  next: DocPage | null;
  onNavigate: (pageId: string, headingId: string | null) => void;
}) {
  const { t } = useLocale();
  if (!previous && !next) return null;

  return (
    <nav className="docs-pager" aria-label={t("docs.pager")}>
      {previous ? (
        <a
          className="docs-pager-link docs-pager-prev"
          href={docPath(previous.id)}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(previous.id, null);
          }}
        >
          <span className="docs-pager-label">{t("docs.previous")}</span>
          <span className="docs-pager-title">{previous.title}</span>
        </a>
      ) : (
        <span className="docs-pager-link docs-pager-prev is-empty" />
      )}
      {next ? (
        <a
          className="docs-pager-link docs-pager-next"
          href={docPath(next.id)}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(next.id, null);
          }}
        >
          <span className="docs-pager-label">{t("docs.next")}</span>
          <span className="docs-pager-title">{next.title}</span>
        </a>
      ) : (
        <span className="docs-pager-link docs-pager-next is-empty" />
      )}
    </nav>
  );
}

export function Documentation() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams<{ pageId?: string; headingId?: string }>();
  const page = getDocPage(params.pageId);
  const headingId = params.headingId ?? null;
  const adjacent = page ? getAdjacentDocPages(page.id) : null;

  const go = (nextPageId: string, nextHeadingId: string | null) => {
    navigate(docPath(nextPageId, nextHeadingId));
  };

  useEffect(() => {
    if (headingId) {
      document.getElementById(headingId)?.scrollIntoView({ block: "start" });
      return;
    }
    window.scrollTo({ top: 0 });
  }, [headingId, page?.id]);

  if (!params.pageId) {
    return <Navigate to={docPath(DOC_PAGES[0].id)} replace />;
  }
  if (!page || !adjacent) {
    return <NotFoundPage />;
  }

  return (
    <section className="docs-wiki" aria-labelledby="docs-title">
      <nav className="docs-summary" aria-label={t("docs.summary")}>
        <h1 id="docs-title">{t("docs.summary")}</h1>
        <ol className="docs-pages">
          {docNavTree(DOC_PAGES).map(({ page: entry, children }) => (
            <li key={entry.id}>
              <a
                className={[
                  entry.id === page.id ? "is-active" : "",
                  children.some((child) => child.id === page.id)
                    ? "is-ancestor"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                href={docPath(entry.id)}
                onClick={(event) => {
                  event.preventDefault();
                  go(entry.id, null);
                }}
              >
                {entry.title}
              </a>
              {children.length > 0 && (
                <ol className="docs-pages-children">
                  {children.map((child) => (
                    <li key={child.id}>
                      <a
                        className={child.id === page.id ? "is-active" : ""}
                        href={docPath(child.id)}
                        onClick={(event) => {
                          event.preventDefault();
                          go(child.id, null);
                        }}
                      >
                        {child.title}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <article className="docs-article">
        <MarkdownDoc source={page.source} onNavigate={go} />
        <DocsPager
          previous={adjacent.previous}
          next={adjacent.next}
          onNavigate={go}
        />
      </article>
    </section>
  );
}

export function DocsPage() {
  return <Documentation />;
}
