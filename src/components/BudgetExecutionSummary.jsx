import { useI18n } from "../contexts/I18nContext";
import { formatNumber } from "../utils/numberFormat";
import { summarizeBudgetExecution } from "../../supabase/functions/_shared/budgetExecution.js";

export default function BudgetExecutionSummary({ rows, numberOptions }) {
  const { t } = useI18n();
  const totals = summarizeBudgetExecution(rows);
  return (
    <section className="crud-form-section form-span-2">
      <p>{t("budgets.basis")}</p>
      {rows.some((row) => row.unclassified) ? <p>{t("budgets.unclassifiedWarning")}</p> : null}
      {rows.some((row) => row.unvaluedReturn) ? <p className="error-text">{t("budgets.returnWarning")}</p> : null}
      <table className="crud-table">
        <thead><tr><th>{t("common.type")}</th><th>{t("budgets.budgetAmount")}</th><th>{t("reports.executed")}</th><th>{t("reports.variance")}</th></tr></thead>
        <tbody>{["income", "expense", "result"].map((type) => {
          const row = type === "result" ? totals : totals[type];
          return <tr key={type}><th>{t(`budgets.${type}`)}</th>
            <td className="num-col">{formatNumber(row.budgeted, numberOptions)}</td>
            <td className="num-col">{formatNumber(row.executed, numberOptions)}</td>
            <td className={`num-col ${row.variance < 0 ? "text-danger" : ""}`}>{formatNumber(row.variance, numberOptions)}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
  );
}
