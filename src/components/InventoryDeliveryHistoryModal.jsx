import { useI18n } from "../contexts/I18nContext";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function formatDateTime(value, language) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default function InventoryDeliveryHistoryModal({ isOpen, onClose, transaction, history = [], isLoading = false }) {
  const { t, language } = useI18n();

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(event) => event.stopPropagation()}>
        <div className="page-header-row">
          <h3>{t("inventory.deliveries.historyTitle")}</h3>
          <button type="button" className="button-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>

        <section className="generic-panel">
          <p>ID: {transaction?.id ?? "-"}</p>
          <p>
            {t("transactions.date")}: {transaction?.date ? formatDate(transaction.date, language) : "-"}
          </p>
          <p>
            {t("transactions.person")}: {transaction?.persons?.name ?? "-"}
          </p>
          <p>
            {t("transactions.referenceNumber")}: {transaction?.referenceNumber ?? "-"}
          </p>
        </section>

        <section className="generic-panel">
          {isLoading ? (
            <p>{t("common.loading")}</p>
          ) : history.length === 0 ? (
            <p>{t("inventory.deliveries.noHistory")}</p>
          ) : (
            <table className="crud-table">
              <thead>
                <tr>
                  <th>{t("inventory.deliveries.deliveryRecordedAt")}</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("transactions.product")}</th>
                  <th className="num-col">{t("inventory.deliveries.deliveredQuantity")}</th>
                </tr>
              </thead>
              {history.map((batch) => (
                <tbody key={batch.deliveryBatchKey}>
                  <tr className="nested-table-row">
                    <td colSpan={4}>
                      <strong>{formatDateTime(batch.createdAt, language)}</strong>
                    </td>
                  </tr>
                  {batch.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{formatDateTime(batch.createdAt, language)}</td>
                      <td>{batch.deliveryDate ? formatDate(batch.deliveryDate, language) : "-"}</td>
                      <td>{line.productName || "-"}</td>
                      <td className="num-col">
                        {formatNumber(line.quantity || 0, {
                          showCurrency: false,
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
