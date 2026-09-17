import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LogIn, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { login, register, type User } from "../services/auth";
import { APP_CONFIG } from "../config/app";
import { paths } from "../docs/paths";
import { t } from "../i18n/messages";

export type AuthMode = "login" | "register";

interface AuthPanelProps {
  mode: AuthMode;
  onAuthenticated: (user: User) => void;
}

export function AuthPanel({ mode, onAuthenticated }: AuthPanelProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      const user =
        mode === "register"
          ? await register({ name, email, password })
          : await login({ email, password });
      onAuthenticated(user);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("auth.failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === "register" ? t("auth.registerTitle") : t("auth.signInTitle");
  const submitLabel =
    mode === "register" ? t("auth.submitRegister") : t("auth.submitSignIn");

  return (
    <section className="auth-view" aria-labelledby="auth-title">
      <div className="auth-card">
        <h1 id="auth-title">{title}</h1>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              {t("auth.name")}
              <input
                autoComplete="name"
                minLength={APP_CONFIG.auth.nameMinLength}
                maxLength={APP_CONFIG.auth.nameMaxLength}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label>
            {t("auth.email")}
            <input
              autoComplete="email"
              type="email"
              maxLength={APP_CONFIG.auth.emailMaxLength}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            {t("auth.password")}
            <span className="password-field">
              <input
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                type={showPassword ? "text" : "password"}
                minLength={APP_CONFIG.auth.passwordMinLength}
                maxLength={APP_CONFIG.auth.passwordMaxLength}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="password-toggle"
                type="button"
                aria-pressed={showPassword}
                aria-label={
                  showPassword ? t("auth.hidePassword") : t("auth.showPassword")
                }
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>
          {mode === "register" && (
            <label>
              {t("auth.confirmPassword")}
              <input
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                minLength={APP_CONFIG.auth.passwordMinLength}
                maxLength={APP_CONFIG.auth.passwordMaxLength}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="run-button auth-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle className="spin" size={16} />
            ) : mode === "register" ? (
              <UserPlus size={16} />
            ) : (
              <LogIn size={16} />
            )}
            {submitLabel}
          </button>
        </form>

        <Link
          className="auth-switch auth-switch-create"
          to={mode === "register" ? paths.signIn : paths.register}
        >
          {mode === "register"
            ? t("auth.switchToSignIn")
            : t("auth.switchToRegister")}
        </Link>
      </div>
    </section>
  );
}
