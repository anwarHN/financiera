import { Fragment } from "react";
import { useI18n } from "../contexts/I18nContext";
import { formatNumber } from "../utils/numberFormat";
import { summarizeIncomeStatement } from "../../supabase/functions/_shared/budgetExecution.js";

export default function ProjectIncomeStatement({ rows, numberOptions }) {
  const { t } = useI18n();
  const totals = summarizeIncomeStatement(rows);
  return <section>
    <p>{t("incomeStatement.basis")}</p>
    {rows.some((row) => row.unclassified) && <p>{t("budgets.unclassifiedWarning")}</p>}
    {rows.some((row) => row.unvaluedReturn) && <p className="error-text">{t("incomeStatement.returnWarning")}</p>}
    <table className="crud-table">
      <thead><tr><th>{t("transactions.concept")}</th><th>{t("incomeStatement.base")}</th><th>{t("transactions.tax")}</th><th>{t("transactions.total")}</th></tr></thead>
      <tbody>
        {["income", "expense"].map((type) => <Fragment key={type}>
          <tr className="report-section-row"><th colSpan={4}>{t(`budgets.${type}`)}</th></tr>
          {rows.filter((row) => row.lineType === type).map((row) => <tr key={row.id}>
            <td>{row.unclassified ? `${t("budgets.unclassified")} / ` : ""}{row.conceptName}</td>
            <td className="num-col">{formatNumber(row.base, numberOptions)}</td><td className="num-col">{formatNumber(row.tax, numberOptions)}</td><td className="num-col">{formatNumber(row.total, numberOptions)}</td>
          </tr>)}
          <tr><th>{t("transactions.total")} {t(`budgets.${type}`)}</th>{["base", "tax", "total"].map((field) => <td className="num-col" key={field}>{formatNumber(totals[type][field], numberOptions)}</td>)}</tr>
        </Fragment>)}
        <tr className="report-section-row"><th colSpan={4}>{t("incomeStatement.results")}</th></tr>
        <tr><th>{t("incomeStatement.resultWithTaxes")}</th><td colSpan={2} /><td className="num-col">{formatNumber(totals.resultWithTaxes, numberOptions)}</td></tr>
        <tr><th>{t("incomeStatement.salesTax")}</th><td /><td className="num-col">{formatNumber(totals.income.tax, numberOptions)}</td><td /></tr>
        <tr><th>{t("incomeStatement.inputTaxCredit")}</th><td /><td className="num-col">{formatNumber(totals.expense.tax, numberOptions)}</td><td /></tr>
        <tr><th>{t("incomeStatement.taxBalance")}</th><td /><td className="num-col">{formatNumber(totals.taxBalance, numberOptions)}</td><td /></tr>
        <tr><th>{t("incomeStatement.resultWithTaxCredit")}</th><td colSpan={2} /><td className="num-col">{formatNumber(totals.result, numberOptions)}</td></tr>
      </tbody>
    </table>
  </section>;
}
