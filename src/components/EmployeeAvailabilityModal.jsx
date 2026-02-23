import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listEmployeeAvailabilityByEmployee, replaceEmployeeAvailability } from "../services/employeeScheduleService";

const days = [
  { dayOfWeek: 1, es: "Lunes", en: "Monday" },
  { dayOfWeek: 2, es: "Martes", en: "Tuesday" },
  { dayOfWeek: 3, es: "Miércoles", en: "Wednesday" },
  { dayOfWeek: 4, es: "Jueves", en: "Thursday" },
  { dayOfWeek: 5, es: "Viernes", en: "Friday" },
  { dayOfWeek: 6, es: "Sábado", en: "Saturday" },
  { dayOfWeek: 0, es: "Domingo", en: "Sunday" }
];

const initialRows = days.map((item) => ({ dayOfWeek: item.dayOfWeek, isAvailable: false, startTime: "08:00", endTime: "17:00" }));

export default function EmployeeAvailabilityModal({ employee, isOpen, onClose, onSaved }) {
  const { t, language } = useI18n();
  const { account, user } = useAuth();
  const [rows, setRows] = useState(initialRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dayMap = useMemo(() => new Map(days.map((d) => [d.dayOfWeek, language === "es" ? d.es : d.en])), [language]);

  useEffect(() => {
    if (!isOpen || !employee?.id) return;
    let mounted = true;
    const load = async () => {
      try {
        const data = await listEmployeeAvailabilityByEmployee(employee.id);
        if (!mounted) return;
        const byDay = new Map((data ?? []).map((row) => [Number(row.dayOfWeek), row]));
        setRows(
          initialRows.map((row) => {
            const found = byDay.get(Number(row.dayOfWeek));
            return found
              ? {
                  dayOfWeek: row.dayOfWeek,
                  isAvailable: true,
                  startTime: String(found.startTime || "08:00").slice(0, 5),
                  endTime: String(found.endTime || "17:00").slice(0, 5)
                }
              : row;
          })
        );
      } catch {
        if (mounted) setError(t("common.genericLoadError"));
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [isOpen, employee?.id]);

  if (!isOpen || !employee) return null;

  const updateRow = (dayOfWeek, patch) => {
    setRows((prev) => prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSaving(true);
      await replaceEmployeeAvailability({
        accountId: account.accountId,
        employeeId: employee.id,
        createdById: user.id,
        rows
      });
      onSaved?.();
      onClose?.();
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
        <form className="crud-form" onSubmit={handleSave}>
          <h3>{`${t("employees.availabilityFor")}: ${employee.name}`}</h3>
          {error ? <p className="error-text">{error}</p> : null}
          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("appointments.rangeDay")}</th>
                <th>{t("common.status")}</th>
                <th>{t("reports.dateFrom")}</th>
                <th>{t("reports.dateTo")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`availability-row-${row.dayOfWeek}`}>
                  <td>{dayMap.get(row.dayOfWeek)}</td>
                  <td>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={row.isAvailable}
                        onChange={(event) => updateRow(row.dayOfWeek, { isAvailable: event.target.checked })}
                      />
                      {row.isAvailable ? t("common.yes") : t("common.no")}
                    </label>
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.startTime}
                      disabled={!row.isAvailable}
                      onChange={(event) => updateRow(row.dayOfWeek, { startTime: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.endTime}
                      disabled={!row.isAvailable}
                      onChange={(event) => updateRow(row.dayOfWeek, { endTime: event.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="crud-form-actions">
            <button type="button" className="button-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving} className={saving ? "is-saving" : ""}>
              {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
