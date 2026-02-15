import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deleteConcept, listConcepts } from "../services/conceptsService";

const pageSize = 10;

function ConceptsPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listConcepts(account.accountId);
      setItems(data);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteConcept(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("concepts.title")}</h1>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p>{t("common.empty")}</p>
      ) : (
        <>
          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("concepts.parentConceptId")}</th>
                <th>{t("concepts.taxPercentage")}</th>
                <th>{t("concepts.flags")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.parentConceptId ?? "-"}</td>
                  <td>{item.taxPercentage}</td>
                  <td>
                    {[
                      item.isGroup ? t("concepts.isGroup") : null,
                      item.isIncome ? t("concepts.isIncome") : null,
                      item.isExpense ? t("concepts.isExpense") : null,
                      item.isProduct ? t("concepts.isProduct") : null,
                      item.isPaymentForm ? t("concepts.isPaymentForm") : null
                    ]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </td>
                  <td className="table-actions">
                    <Link className="button-link-secondary" to={`/concepts/${item.id}/edit`}>
                      {t("common.edit")}
                    </Link>
                    <button type="button" className="button-danger" onClick={() => handleDelete(item.id)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default ConceptsPage;
