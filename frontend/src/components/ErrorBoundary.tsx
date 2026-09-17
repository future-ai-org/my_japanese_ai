import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n/messages";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("japanese review crashed.", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="error-view" role="alert">
        <h1>{t("error.title")}</h1>
        <p>{t("error.body")}</p>
        <button
          className="run-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          {t("error.reload")}
        </button>
      </section>
    );
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
