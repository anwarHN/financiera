import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

function PrivacyPolicyPage() {
  const { language } = useI18n();
  const isEs = language === "es";

  return (
    <div className="auth-page">
      <article className="auth-card legal-card">
        <h1>{isEs ? "Política de Privacidad" : "Privacy Policy"}</h1>
        <p>
          {isEs
            ? "Esta política explica cómo se manejan los datos dentro del sistema."
            : "This policy explains how data is handled within the system."}
        </p>
        <h2>{isEs ? "Propiedad y acceso de datos" : "Data ownership and access"}</h2>
        <ul>
          <li>
            {isEs
              ? "Todos los datos registrados en tu cuenta son propiedad del usuario titular de la cuenta."
              : "All data registered in your account is owned by the account holder user."}
          </li>
          <li>
            {isEs
              ? "Ningún tercero tiene acceso a tus datos operativos, salvo obligación legal aplicable."
              : "No third party has access to your operational data, except where required by applicable law."}
          </li>
        </ul>
        <h2>{isEs ? "Fin de membresía" : "End of membership"}</h2>
        <p>
          {isEs
            ? "Al finalizar tu membresía, puedes solicitar el extracto completo de tus datos y la eliminación de tu cuenta."
            : "When your membership ends, you can request a complete data extract and account deletion."}
        </p>
        <h2>{isEs ? "Pagos y tarjetas" : "Payments and cards"}</h2>
        <p>
          {isEs
            ? "Los datos de tarjetas de crédito son administrados por PayPal. La plataforma no almacena datos sensibles completos de tarjetas."
            : "Credit card data is managed by PayPal. The platform does not store full sensitive card data."}
        </p>
        <p>
          {isEs
            ? "Si se agrega un nuevo procesador de pagos, esta política se actualizará para reflejar dicho cambio."
            : "If a new payment processor is added, this policy will be updated to reflect that change."}
        </p>
        <div className="legal-actions">
          <Link to="/register">{isEs ? "Volver al registro" : "Back to sign up"}</Link>
          <Link to="/terms-of-service">{isEs ? "Ver términos y condiciones" : "View terms and conditions"}</Link>
        </div>
      </article>
    </div>
  );
}

export default PrivacyPolicyPage;
