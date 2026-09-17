import { Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./components/ErrorBoundary";
import { AppLayout } from "./components/AppLayout";
import { RequireAuth } from "./components/RequireAuth";
import { ReviewPage } from "./components/ReviewWorkspace";
import { ToastHost } from "./components/ToastHost";
import { ReviewSessionProvider } from "./context/ReviewSessionContext";
import { SessionProvider } from "./context/SessionContext";
import { ToastProvider } from "./context/ToastContext";
import { paths } from "./docs/paths";
import { DashboardPage } from "./pages/DashboardPage";
import { AccountPage } from "./pages/AccountPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignInPage } from "./pages/SignInPage";

function AppRoutes() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={paths.home} element={<ReviewPage />} />
          <Route path={paths.review} element={<ReviewPage />} />
          <Route element={<RequireAuth />}>
            <Route path={paths.dashboard} element={<DashboardPage />} />
            <Route path={paths.account} element={<AccountPage />} />
          </Route>
          <Route path={paths.signIn} element={<SignInPage mode="login" />} />
          <Route path={paths.register} element={<SignInPage mode="register" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <ReviewSessionProvider>
          <AppErrorBoundary>
            <AppRoutes />
            <ToastHost />
          </AppErrorBoundary>
        </ReviewSessionProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
