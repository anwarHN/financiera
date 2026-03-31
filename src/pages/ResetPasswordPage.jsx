import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { updatePassword } from "../services/authService";
import daimeLogoMarkup from "../../assets/logo2.svg?raw";
import daimeWordmarkMarkup from "../../assets/logo_text.svg?raw";

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!password || password.length < 6) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword({ password });
      setSuccess(t("auth.passwordResetSuccess"));
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch {
      setError(t("auth.passwordResetInvalidLink"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-split-layout">
        <section className="auth-hero-panel">
          <div className="auth-brand-lockup">
            <div className="auth-hero-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: daimeLogoMarkup }} />
            <div className="auth-hero-wordmark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: daimeWordmarkMarkup }} />
          </div>
          <div className="auth-hero-copy">
            <p className="auth-eyebrow">{t("common.appName")}</p>
            <h1>{t("auth.resetPasswordTitle")}</h1>
            <p>{t("auth.resetPasswordText")}</p>
          </div>
        </section>

        <section className="auth-form-panel">
          <form className="auth-card" onSubmit={handleSubmit}>
            <h1>{t("auth.resetPasswordTitle")}</h1>

            <label htmlFor="password">{t("auth.newPassword")}</label>
            <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />

            <label htmlFor="confirmPassword">{t("auth.confirmPassword")}</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />

            {error ? <p className="error-text">{error}</p> : null}
            {success ? <p className="success-text">{success}</p> : null}

            <button type="submit" disabled={isSubmitting}>
              {t("auth.saveNewPassword")}
            </button>

            <Link to="/login">{t("auth.goToLogin")}</Link>
          </form>
        </section>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
