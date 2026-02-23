import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { listEmployees } from "../services/employeesService";
import {
  createEmployeeAbsence,
  deactivateEmployeeAbsence,
  listEmployeeAbsences,
  updateEmployeeAbsence
} from "../services/employeeScheduleService";
import { formatDate } from "../utils/dateFormat";

const pageSize = 10;

const initialForm = {
  employeeId: "",
  dateFrom: "",
  dateTo: "",
  reason: ""
};

function EmployeeAbsencesPage() {
  const { t, language } = useI18n();
  const { account, user } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("appointments");
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const editingRow = useMemo(() => rows.find((item) => String(item.id) === String(editId)) || null, [rows, editId]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  useEffect(() => {
    if (!editingRow) {
      setForm(initialForm);
      return;
    }
    setForm({
      employeeId: String(editingRow.employeeId || ""),
      dateFrom: editingRow.dateFrom || "",
      dateTo: editingRow.dateTo || "",
      reason: editingRow.reason || ""
    });
  }, [editingRow]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeeData, absenceData] = await Promise.all([
        listEmployees(account.accountId, { includeInactive: false }),
        listEmployeeAbsences(account.accountId, { includeInactive: true })
      ]);
      setEmployees(employeeData);
      setRows(absenceData);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    setSearchParams(next);
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.employeeId || !form.dateFrom || !form.dateTo) {
      setError(t("common.requiredFields"));
      return;
    }

    if (form.dateTo < form.dateFrom) {
      setError(t("appointments.invalidRange"));
      return;
    }

    try {
      setSaving(true);
      const payload = {
        accountId: account.accountId,
        employeeId: Number(form.employeeId),
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        reason: form.reason.trim() || null,
        isActive: true
      };

      if (editingRow) {
        await updateEmployeeAbsence(editingRow.id, payload);
      } else {
        await createEmployeeAbsence({ ...payload, createdById: user.id });
      }

      await loadData();
      closeModal();
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await deactivateEmployeeAbsence(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("employees.absencesTitle")}</h1>
      {error ? <p className="error-text">{error}</p> : null}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p>{t("common.empty")}</p>
      ) : (
        <>
          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("appointments.employee")}</th>
                <th>{t("reports.dateFrom")}</th>
                <th>{t("reports.dateTo")}</th>
                <th>{t("appointments.notes")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.employes?.name || "-"}</td>
                  <td>{formatDate(row.dateFrom, language)}</td>
                  <td>{formatDate(row.dateTo, language)}</td>
                  <td>{row.reason || "-"}</td>
                  <td>
                    <StatusBadge tone={row.isActive ? "success" : "muted"}>
                      {row.isActive ? t("common.active") : t("common.inactive")}
                    </StatusBadge>
                  </td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(canUpdate
                          ? [{
                          key: "edit",
                          label: t("common.edit"),
                          onClick: () => {
                            const next = new URLSearchParams(searchParams);
                            next.set("edit", String(row.id));
                            next.delete("create");
                            setSearchParams(next);
                          }
                        }]
                          : []),
                        ...(canUpdate
                          ? [{
                          key: "deactivate",
                          label: t("common.deactivate"),
                          onClick: () => handleDeactivate(row.id),
                          disabled: !row.isActive,
                          danger: true
                        }]
                          : [])
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} pageSize={pageSize} totalItems={rows.length} onPageChange={setPage} />
        </>
      )}

      {(isCreateModalOpen || Boolean(editingRow)) && (canCreate || canUpdate) ? (
        <div className="modal-backdrop">
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleSubmit}>
              <h3>{editingRow ? t("common.edit") : t("employees.newAbsence")}</h3>
              <div className="form-grid-2">
                <label className="field-block form-span-2">
                  <span>{t("appointments.employee")}</span>
                  <select name="employeeId" value={form.employeeId} onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))} required>
                    <option value="">{`-- ${t("appointments.employee")} --`}</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>{t("reports.dateFrom")}</span>
                  <input type="date" name="dateFrom" value={form.dateFrom} onChange={(event) => setForm((prev) => ({ ...prev, dateFrom: event.target.value }))} required />
                </label>
                <label className="field-block">
                  <span>{t("reports.dateTo")}</span>
                  <input type="date" name="dateTo" value={form.dateTo} onChange={(event) => setForm((prev) => ({ ...prev, dateTo: event.target.value }))} required />
                </label>
                <label className="field-block form-span-2">
                  <span>{t("appointments.notes")}</span>
                  <input type="text" name="reason" value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} />
                </label>
              </div>
              <div className="crud-form-actions">
                <button type="button" className="button-secondary" onClick={closeModal}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} className={saving ? "is-saving" : ""}>
                  {editingRow ? t("common.update") : t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default EmployeeAbsencesPage;
