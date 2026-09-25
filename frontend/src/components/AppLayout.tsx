import { useEffect } from "react";
import { Languages, LoaderCircle, LogIn, LogOut, UserPlus } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useReviewSession } from "../context/ReviewSessionContext";
import { useSession } from "../context/SessionContext";
import { isDashboardPath, isReviewPath, paths } from "../docs/paths";
import { useLocale } from "../i18n/locale";
import type { MessageKey } from "../i18n/messages";

const TITLE_KEYS: Record<string, MessageKey> = {
  [paths.review]: "meta.title.review",
  [paths.home]: "meta.title.review",
  [paths.dashboard]: "meta.title.dashboard",
  [paths.account]: "meta.title.account",
  [paths.signIn]: "meta.title.signIn",
  [paths.register]: "meta.title.register",
};

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector(selector);
  if (element instanceof HTMLMetaElement) {
    element.setAttribute(attribute, value);
  }
}

function DocumentTitle() {
  const { t, locale } = useLocale();
  const { pathname } = useLocation();
  const title = pathname.startsWith(paths.docs)
    ? t("meta.title.docs")
    : t(TITLE_KEYS[pathname] ?? "meta.title.notFound");

  useEffect(() => {
    document.title = title;
    document.documentElement.lang = locale === "ja" ? "ja" : "en";
    const origin = window.location.origin;
    setMeta('meta[name="description"]', "content", t("meta.description"));
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", t("meta.description"));
    setMeta('meta[property="og:image"]', "content", `${origin}/og-image.png`);
    setMeta('meta[property="og:url"]', "content", `${origin}${pathname}`);
    setMeta(
      'meta[property="og:locale"]',
      "content",
      locale === "ja" ? "ja_JP" : "en_US",
    );
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", t("meta.description"));
    setMeta('meta[name="twitter:image"]', "content", `${origin}/og-image.png`);
  }, [locale, pathname, t, title]);
  return null;
}

function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="language-toggle">
      <Languages size={14} aria-hidden="true" />
      <div
        className="language-toggle__options"
        role="group"
        aria-label={t("locale.label")}
      >
        <button
          className={locale === "en" ? "is-active" : ""}
          lang="en"
          type="button"
          onClick={() => setLocale("en")}
        >
          {t("locale.en")}
        </button>
        <button
          className={locale === "ja" ? "is-active" : ""}
          lang="ja"
          type="button"
          onClick={() => setLocale("ja")}
        >
          {t("locale.ja")}
        </button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { t } = useLocale();
  const { user, isSessionLoading, signOut } = useSession();
  const { clearEditor } = useReviewSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate(paths.review);
  };

  return (
    <div className="app-shell">
      <DocumentTitle />
      <header className="topbar">
        <Link
          className="brand-home"
          to={paths.review}
          aria-label={t("brand.home")}
          onClick={() => clearEditor()}
        >
          <BrandMark />
        </Link>
        <nav aria-label={t("nav.primary")}>
          <NavLink
            to={paths.review}
            className={({ isActive }) =>
              isActive || isReviewPath(pathname) ? "is-active" : ""
            }
          >
            {t("nav.review")}
          </NavLink>
          {user && (
            <NavLink
              to={paths.dashboard}
              className={({ isActive }) =>
                isActive || isDashboardPath(pathname) ? "is-active" : ""
              }
            >
              {t("nav.dashboard")}
            </NavLink>
          )}
          <NavLink
            to={`${paths.docs}/overview`}
            className={({ isActive }) =>
              isActive || pathname.startsWith(paths.docs) ? "is-active" : ""
            }
          >
            {t("nav.docs")}
          </NavLink>
        </nav>
        {isSessionLoading ? (
          <LoaderCircle className="profile-loader spin" size={18} />
        ) : (
          <div className="account-actions">
            <LanguageToggle />
            {user ? (
              <button
                className="header-auth-button"
                type="button"
                onClick={() => void handleSignOut()}
              >
                <LogOut size={14} />
                {t("nav.signOut")}
              </button>
            ) : (
              <>
                <NavLink className="header-auth-button" to={paths.signIn}>
                  <LogIn size={14} />
                  {t("nav.signIn")}
                </NavLink>
                <NavLink
                  className="header-auth-button is-primary"
                  to={paths.register}
                >
                  <UserPlus size={14} />
                  {t("nav.register")}
                </NavLink>
              </>
            )}
          </div>
        )}
      </header>
      <main>
        <Outlet />
        <footer className="page-footer">
          <span>{t("footer.made")}</span>
        </footer>
      </main>
    </div>
  );
}
