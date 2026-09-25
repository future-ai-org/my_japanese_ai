import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocale } from "../i18n/locale";
import { translate, type Locale } from "../i18n/messages";

interface ErrorBoundaryProps {
  children: ReactNode;
  locale?: Locale;
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
    console.error("AI code review crashed.", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const locale = this.props.locale ?? "en";
    return (
      <section className="error-view" role="alert">
        <h1>{translate(locale, "error.title")}</h1>
        <p>{translate(locale, "error.body")}</p>
        <button
          className="run-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          {translate(locale, "error.reload")}
        </button>
      </section>
    );
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  return <ErrorBoundary locale={locale}>{children}</ErrorBoundary>;
}
