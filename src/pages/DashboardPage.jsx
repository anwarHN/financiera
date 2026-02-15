import { useI18n } from "../contexts/I18nContext";

function DashboardPage() {
  const { t } = useI18n();

  return (
    <div>
      <h1>{t("dashboard.title")}</h1>
      <p>{t("dashboard.subtitle")}</p>
    </div>
  );
}

export default DashboardPage;
