import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import { requestPasswordReset } from "../services/authService";
import daimeLogoMarkup from "../../assets/logo2.svg?raw";
import daimeWordmarkMarkup from "../../assets/logo_text.svg?raw";

function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      await requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`
      });
      setSuccess(t("auth.resetPasswordEmailSent"));
    } catch {
      setError(t("auth.genericError"));
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
            <h1>{t("auth.forgotPasswordTitle")}</h1>
            <p>{t("auth.forgotPasswordText")}</p>
          </div>
        </section>

        <section className="auth-form-panel">
          <form className="auth-card" onSubmit={handleSubmit}>
            <h1>{t("auth.forgotPasswordTitle")}</h1>

            <label htmlFor="email">{t("auth.email")}</label>
            <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

            {error ? <p className="error-text">{error}</p> : null}
            {success ? <p className="success-text">{success}</p> : null}

            <button type="submit" disabled={isSubmitting}>
              {t("auth.sendResetLink")}
            </button>

            <Link to="/login">{t("auth.goToLogin")}</Link>
          </form>
        </section>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
