import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

function TermsOfServicePage() {
  const { language } = useI18n();
  const isEs = language === "es";

  return (
    <div className="auth-page">
      <article className="auth-card legal-card">
        <h1>{isEs ? "Términos y Condiciones del Servicio" : "Terms and Conditions of Service"}</h1>
        <p>
          {isEs
            ? "Al utilizar este sistema, aceptas cumplir estos términos y todas las leyes aplicables."
            : "By using this system, you agree to comply with these terms and all applicable laws."}
        </p>
        <h2>{isEs ? "Uso permitido" : "Permitted use"}</h2>
        <ul>
          <li>
            {isEs
              ? "El sistema no puede usarse para gestionar actividades ilegales ni negocios vinculados a actividades ilícitas."
              : "The system may not be used to manage illegal activities or businesses linked to unlawful conduct."}
          </li>
          <li>
            {isEs
              ? "Está prohibido usar la plataforma para cualquier forma de explotación humana o infantil."
              : "Using the platform for any form of human or child exploitation is strictly prohibited."}
          </li>
        </ul>
        <h2>{isEs ? "Membresía y pagos" : "Membership and payments"}</h2>
        <p>
          {isEs
            ? "Si no se recibe el pago de la membresía durante un mes calendario, la cuenta podrá desactivarse hasta regularizar el pago."
            : "If membership payment is not received for one calendar month, the account may be deactivated until payment is regularized."}
        </p>
        <h2>{isEs ? "Aceptación" : "Acceptance"}</h2>
        <p>
          {isEs
            ? "Al registrarte y continuar usando el sistema, declaras que aceptas estos términos y condiciones."
            : "By signing up and continuing to use the system, you acknowledge and accept these terms and conditions."}
        </p>
        <div className="legal-actions">
          <Link to="/register">{isEs ? "Volver al registro" : "Back to sign up"}</Link>
          <Link to="/privacy-policy">{isEs ? "Ver políticas de privacidad" : "View privacy policy"}</Link>
        </div>
      </article>
    </div>
  );
}

export default TermsOfServicePage;
