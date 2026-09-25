import { useState, type FormEvent } from "react";
import {
  Download,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { APP_CONFIG } from "../config/app";
import {
  deleteAccount,
  exportAccount,
  type User,
} from "../services/auth";
import { useLocale } from "../i18n/locale";

interface AccountPanelProps {
  user: User;
  onDeleted: () => void;
}

function downloadExport(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = APP_CONFIG.export.filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AccountPanel({ user, onDeleted }: AccountPanelProps) {
  const { t } = useLocale();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExport = async () => {
    setError(null);
    setNotice(null);
    setIsExporting(true);
    try {
      downloadExport(await exportAccount());
      setNotice(t("account.exported"));
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : t("account.exportError"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsDeleting(true);
    try {
      await deleteAccount(password);
      onDeleted();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("account.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="account-view" aria-labelledby="account-title">
      <div className="account-card">
        <div className="account-heading">
          <h1 id="account-title">{user.name}</h1>
          <button
            className="run-button account-export-button"
            type="button"
            disabled={isExporting}
            onClick={() => void handleExport()}
          >
            {isExporting ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            {t("account.export")}
          </button>
        </div>
        <p className="account-email">{user.email}</p>

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        <form className="account-delete" onSubmit={handleDelete}>
          <h2>{t("account.deleteTitle")}</h2>
          <p>{t("account.deleteBody")}</p>
          <label>
            {t("account.confirmPassword")}
            <input
              autoComplete="current-password"
              type="password"
              minLength={APP_CONFIG.auth.passwordMinLength}
              maxLength={APP_CONFIG.auth.passwordMaxLength}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            className="run-button account-delete-button"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Trash2 size={16} />
            )}
            {t("account.delete")}
          </button>
        </form>

        <p className="account-retention">
          <ShieldCheck size={14} />
          {t("account.retention", {
            history: APP_CONFIG.retention.historyDays,
            inference: APP_CONFIG.retention.inferenceRequestsDays,
          })}
        </p>
      </div>
    </section>
  );
}
