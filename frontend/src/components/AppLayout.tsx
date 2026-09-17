import { useEffect } from "react";
import {
  LayoutDashboard,
  LoaderCircle,
  LogIn,
  LogOut,
  SquarePen,
  UserPlus,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { useReviewSession } from "../context/ReviewSessionContext";
import { useSession } from "../context/SessionContext";
import { isDashboardPath, isReviewPath, paths } from "../docs/paths";
import { t } from "../i18n/messages";

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector(selector);
  if (element instanceof HTMLMetaElement) {
    element.setAttribute(attribute, value);
  }
}

function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.lang = "en";
    const origin = window.location.origin;
    setMeta('meta[name="description"]', "content", t("meta.description"));
    setMeta('meta[property="og:description"]', "content", t("meta.description"));
    setMeta('meta[property="og:image"]', "content", `${origin}/og-image.png`);
    setMeta('meta[property="og:url"]', "content", `${origin}${pathname}`);
    setMeta('meta[property="og:locale"]', "content", "en_US");
    setMeta('meta[name="twitter:description"]', "content", t("meta.description"));
    setMeta('meta[name="twitter:image"]', "content", `${origin}/og-image.png`);
  }, [pathname]);
  return null;
}

export function AppLayout() {
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
      <div className="app-body">
        <aside className="sidebar">
          <Link
            className="brand-home"
            to={paths.review}
            aria-label={t("brand.home")}
            onClick={() => clearEditor()}
          >
            <BrandMark compact />
          </Link>
          <nav aria-label={t("nav.primary")}>
            <NavLink
              to={paths.review}
              className={({ isActive }) =>
                isActive || isReviewPath(pathname) ? "is-active" : ""
              }
            >
              <SquarePen size={18} aria-hidden="true" />
              <span>{t("nav.review")}</span>
            </NavLink>
            {user && (
              <NavLink
                to={paths.dashboard}
                className={({ isActive }) =>
                  isActive || isDashboardPath(pathname) ? "is-active" : ""
                }
              >
                <LayoutDashboard size={18} aria-hidden="true" />
                <span>{t("nav.dashboard")}</span>
              </NavLink>
            )}
          </nav>
          <div className="sidebar-auth">
            {isSessionLoading ? (
              <LoaderCircle className="profile-loader spin" size={18} />
            ) : user ? (
              <button
                className="sidebar-auth-button"
                type="button"
                onClick={() => void handleSignOut()}
              >
                <LogOut size={18} aria-hidden="true" />
                <span>{t("nav.signOut")}</span>
              </button>
            ) : (
              <>
                <NavLink className="sidebar-auth-button" to={paths.signIn}>
                  <LogIn size={18} aria-hidden="true" />
                  <span>{t("nav.signIn")}</span>
                </NavLink>
                <NavLink className="sidebar-auth-button" to={paths.register}>
                  <UserPlus size={18} aria-hidden="true" />
                  <span>{t("nav.register")}</span>
                </NavLink>
              </>
            )}
          </div>
        </aside>
        <main>
          <Outlet />
          <footer className="page-footer">
            <span>{t("footer.made")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
