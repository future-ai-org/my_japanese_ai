import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dashboard } from "../components/Dashboard";
import { useReviewSession } from "../context/ReviewSessionContext";
import { useSession } from "../context/SessionContext";
import { paths } from "../docs/paths";

export function DashboardPage() {
  const { user } = useSession();
  const session = useReviewSession();
  const { loadHistory } = session;
  const navigate = useNavigate();

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (!user) return null;
  return (
    <Dashboard
      entries={session.history}
      isLoading={session.isHistoryLoading}
      error={session.historyError}
      onOpen={async (entry) => {
        const opened = await session.handleOpenHistory(entry);
        if (opened) navigate(paths.review);
      }}
      onStar={(id, starred) => void session.handleStarHistory(id, starred)}
      onDelete={(id) => void session.handleDeleteHistory(id)}
    />
  );
}
