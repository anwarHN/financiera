import { FiHelpCircle } from "react-icons/fi";
import { useI18n } from "../contexts/I18nContext";

export default function OnboardingHelpButton({ moduleId = null, className = "" }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      className={`module-help-btn ${className}`.trim()}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("onboarding:open", {
            detail: { moduleId }
          })
        );
      }}
      aria-label={t("common.help")}
      title={t("common.help")}
    >
      <FiHelpCircle />
    </button>
  );
}

