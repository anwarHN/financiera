import { useEffect, useMemo, useState } from "react";
import ChartCanvas from "../components/ChartCanvas";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getDashboardData } from "../services/dashboardService";
import { formatNumber } from "../utils/numberFormat";

const palette = ["#0f766e", "#0284c7", "#f59e0b", "#dc2626", "#6366f1", "#10b981", "#f97316", "#8b5cf6"];

function buildDoughnutData(series) {
  if (!series.labels.length) {
    return {
      labels: ["-"],
      datasets: [{ data: [1], backgroundColor: ["#cbd5e1"] }]
    };
  }
  return {
    labels: series.labels,
    datasets: [
      {
        data: series.values,
        backgroundColor: series.labels.map((_, index) => palette[index % palette.length])
      }
    ]
  };
}

function DashboardPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await getDashboardData(account.accountId);
      setData(result);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const salesBarData = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };
    return {
      labels: data.salesByDay.labels,
      datasets: [
        {
          label: t("dashboard.salesMonthBar"),
          data: data.salesByDay.values,
          backgroundColor: "#0f766e"
        }
      ]
    };
  }, [data, t]);

  const lineData = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };
    return {
      labels: data.incomeExpenseLine.labels,
      datasets: [
        {
          label: t("dashboard.incomesLine"),
          data: data.incomeExpenseLine.incomeValues,
          borderColor: "#0f766e",
          backgroundColor: "rgba(15,118,110,0.2)",
          tension: 0.3
        },
        {
          label: t("dashboard.expensesLine"),
          data: data.incomeExpenseLine.expenseValues,
          borderColor: "#dc2626",
          backgroundColor: "rgba(220,38,38,0.2)",
          tension: 0.3
        }
      ]
    };
  }, [data, t]);

  if (isLoading) return <p>{t("common.loading")}</p>;

  return (
    <div className="module-page dashboard-page">
      <h1>{t("dashboard.title")}</h1>
      <p>{t("dashboard.subtitle")}</p>
      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <section className="generic-panel">
            <h2 className="crud-form-section-title">{t("dashboard.bankBalances")}</h2>
            <table className="crud-table">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("paymentForms.provider")}</th>
                  <th>{t("transactions.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {data.bankBalances.length === 0 ? (
                  <tr>
                    <td colSpan={3}>{t("common.empty")}</td>
                  </tr>
                ) : (
                  data.bankBalances.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.provider || "-"}</td>
                      <td>{formatNumber(item.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="dashboard-grid">
            <article className="generic-panel dashboard-panel">
              <h2 className="crud-form-section-title">{t("dashboard.salesMonthBar")}</h2>
              <ChartCanvas type="bar" data={salesBarData} options={{ plugins: { legend: { display: false } } }} />
            </article>

            <article className="generic-panel dashboard-panel">
              <h2 className="crud-form-section-title">{t("dashboard.expensesByConceptDonut")}</h2>
              <ChartCanvas type="doughnut" data={buildDoughnutData(data.expensesByConcept)} />
            </article>

            <article className="generic-panel dashboard-panel">
              <h2 className="crud-form-section-title">{t("dashboard.incomesByConceptDonut")}</h2>
              <ChartCanvas type="doughnut" data={buildDoughnutData(data.incomesByConcept)} />
            </article>

            <article className="generic-panel dashboard-panel">
              <h2 className="crud-form-section-title">{t("dashboard.incomeVsExpenseLine")}</h2>
              <ChartCanvas type="line" data={lineData} />
            </article>

            <article className="generic-panel dashboard-panel">
              <h2 className="crud-form-section-title">{t("dashboard.internalObligationsByPaymentForm")}</h2>
              <ChartCanvas type="doughnut" data={buildDoughnutData(data.internalObligationsByPaymentForm)} />
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export default DashboardPage;
