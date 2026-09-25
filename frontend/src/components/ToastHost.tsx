import { X } from "lucide-react";
import { useLocale } from "../i18n/locale";
import { useToast } from "../context/ToastContext";

export function ToastHost() {
  const { t } = useLocale();
  const { toasts, dismissToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          className={`toast toast--${toast.kind}`}
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span>{toast.message}</span>
          <button
            aria-label={t("toast.dismiss")}
            type="button"
            onClick={() => dismissToast(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
