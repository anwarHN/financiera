import { useI18n } from "../contexts/I18nContext";

function Pagination({ page, pageSize, totalItems, onPageChange }) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="pagination-wrap">
      <button type="button" className="button-secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        {t("common.previous")}
      </button>
      <span>
        {t("common.page")} {page} {t("common.of")} {totalPages}
      </span>
      <button
        type="button"
        className="button-secondary"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        {t("common.next")}
      </button>
    </div>
  );
}

export default Pagination;
