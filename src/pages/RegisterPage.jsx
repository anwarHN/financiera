import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import daimeLogoMarkup from "../../assets/logo2.svg?raw";

const initialForm = {
  fullName: "",
  companyName: "",
  email: "",
  password: "",
  countryCode: "",
  invitationId: "",
  acceptedTerms: false
};

function RegisterPage() {
  const { register, user } = useAuth();
  const { t } = useI18n();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInvitedFlow, setIsInvitedFlow] = useState(false);

  useEffect(() => {
    const locale = navigator.language || "en-US";
    const region = locale.includes("-") ? locale.split("-")[1].toUpperCase() : "US";
    const params = new URLSearchParams(window.location.search);
    const invitationId = params.get("invitationId") || "";
    const invitedEmail = params.get("email") || "";
    setIsInvitedFlow(Boolean(invitationId && invitedEmail));

    setForm((prev) => ({
      ...prev,
      countryCode: region,
      invitationId,
      email: invitedEmail || prev.email
    }));
  }, []);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      await register(form);
      setSuccessMessage(t("auth.registrationSuccess"));
      setForm(initialForm);
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
          <div className="auth-hero-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: daimeLogoMarkup }} />
          <div className="auth-hero-copy">
            <p className="auth-eyebrow">{t("common.appName")}</p>
            <h1>{t("auth.registerWelcomeTitle")}</h1>
            <p>{t("auth.registerWelcomeText")}</p>
          </div>
        </section>

        <section className="auth-form-panel">
          <form className="auth-card" onSubmit={handleSubmit}>
            <h1>{t("auth.registerTitle")}</h1>

            <label htmlFor="fullName">{t("auth.fullName")}</label>
            <input
              id="fullName"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
            />

            <label htmlFor="companyName">{t("auth.companyName")}</label>
            <input
              id="companyName"
              name="companyName"
              value={form.companyName}
              onChange={handleChange}
              required
            />

            <label htmlFor="email">{t("auth.email")}</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              readOnly={isInvitedFlow}
              required
            />

            <label htmlFor="password">{t("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              value={form.password}
              onChange={handleChange}
              required
            />

            <label className="auth-checkbox">
              <input
                name="acceptedTerms"
                type="checkbox"
                checked={Boolean(form.acceptedTerms)}
                onChange={handleChange}
                required
              />
              <span>
                {t("auth.acceptTermsPrefix")}{" "}
                <Link to="/terms-of-service">{t("auth.termsOfService")}</Link> {t("auth.and")}{" "}
                <Link to="/privacy-policy">{t("auth.privacyPolicy")}</Link>.
              </span>
            </label>

            {error && <p className="error-text">{error}</p>}
            {successMessage && <p className="success-text">{successMessage}</p>}

            <button type="submit" disabled={isSubmitting}>
              {t("auth.createAccount")}
            </button>

            <Link to="/login">{t("auth.goToLogin")}</Link>
          </form>
        </section>
      </div>
    </div>
  );
}

export default RegisterPage;
