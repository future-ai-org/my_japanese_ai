import { Link } from "react-router-dom";
import { HistoryPanel } from "./HistoryPanel";
import { paths } from "../docs/paths";
import { t } from "../i18n/messages";
import type { ReviewHistorySummary } from "../types/review";

interface DashboardProps {
  entries: ReviewHistorySummary[];
  isLoading: boolean;
  error: string | null;
  onOpen: (entry: ReviewHistorySummary) => void;
  onStar: (id: string, starred: boolean) => void;
  onDelete: (id: string) => void;
}

export function Dashboard({
  entries,
  isLoading,
  error,
  onOpen,
  onStar,
  onDelete,
}: DashboardProps) {

  return (
    <section className="dashboard-view" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <h1 id="dashboard-title">{t("dashboard.library")}</h1>
        <Link className="dashboard-account" to={paths.account}>
          {t("dashboard.account")}
        </Link>
      </div>

      <HistoryPanel
        entries={entries}
        isLoading={isLoading}
        error={error}
        onOpen={onOpen}
        onStar={onStar}
        onDelete={onDelete}
      />
    </section>
  );
}
