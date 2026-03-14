import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

function AccessDeniedPage({ fallbackPath = "/" }) {
  const { t } = useI18n();

  return (
    <div className="screen-message access-denied-state">
      <h2>{t("common.accessDeniedTitle")}</h2>
      <p>{t("common.accessDeniedDescription")}</p>
      <Link to={fallbackPath} className="button-link-primary">
        {t("common.goToAvailableArea")}
      </Link>
    </div>
  );
}

export default AccessDeniedPage;
