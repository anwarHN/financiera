import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import AppointmentFormModal from "../components/AppointmentFormModal";
import AppointmentsCalendar from "../components/AppointmentsCalendar";
import RowActionsMenu from "../components/RowActionsMenu";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { createAppointment, listAppointments, updateAppointment } from "../services/appointmentsService";
import { listEmployeeAbsences, listEmployeeAvailability } from "../services/employeeScheduleService";
import { listEmployees } from "../services/employeesService";
import { formatDateTime } from "../utils/dateFormat";

const pageSize = 10;

function parseLocalDateInput(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return new Date(value);
}

function startOfWeek(date) {
  const copy = parseLocalDateInput(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date) {
  const copy = parseLocalDateInput(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfMonth(date) {
  const copy = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function buildRange(anchorDate, rangeMode) {
  const base = parseLocalDateInput(anchorDate);
  if (rangeMode === "day") {
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(base);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (rangeMode === "month") {
    return { start: startOfMonth(base), end: endOfMonth(base) };
  }

  const start = startOfWeek(base);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateToInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusLabel(t, status) {
  if (status === "attended") return t("appointments.statusAttended");
  if (status === "missed") return t("appointments.statusMissed");
  if (status === "canceled") return t("appointments.statusCanceled");
  return t("appointments.statusPending");
}

function statusClass(status) {
  if (status === "attended") return "success";
  if (status === "missed") return "danger";
  if (status === "canceled") return "muted";
  return "warning";
}

function AppointmentsPage({ mode = "calendar" }) {
  const { t, language } = useI18n();
  const { account, user } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("appointments");
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [availabilityRows, setAvailabilityRows] = useState([]);
  const [absenceRows, setAbsenceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [editingItem, setEditingItem] = useState(null);
  const [createDraftStart, setCreateDraftStart] = useState(null);
  const [createDraftEmployeeId, setCreateDraftEmployeeId] = useState("");
  const [createDraftEmployeeName, setCreateDraftEmployeeName] = useState("");
  const [createAvailabilityAlert, setCreateAvailabilityAlert] = useState("");

  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const rangeMode = searchParams.get("range") || "week";
  const anchorDate = searchParams.get("date") || dateToInput(startOfWeek(new Date()));
  const resourceFilter = searchParams.get("employeeId") || "";

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let hasChanges = false;

    if (!next.get("range")) {
      next.set("range", "week");
      hasChanges = true;
    }

    const range = next.get("range");
    if (range === "year") {
      next.set("range", "month");
      hasChanges = true;
    }

    if (!next.get("date")) {
      next.set("date", dateToInput(startOfWeek(new Date())));
      hasChanges = true;
    }

    if (mode === "by-employee") {
      const groupedRange = next.get("range");
      if (groupedRange !== "week" && groupedRange !== "month") {
        next.set("range", "week");
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, mode]);

  const range = useMemo(() => buildRange(anchorDate, rangeMode), [anchorDate, rangeMode]);
  const allEmployeeResources = useMemo(
    () => employees.map((item) => ({ id: `emp-${item.id}`, name: item.name, employeeId: item.id })),
    [employees]
  );

  const filteredAppointments = useMemo(() => {
    if (mode === "table") return appointments;
    if (!resourceFilter) return appointments;
    return appointments.filter((item) => Number(item.employeeId) === Number(resourceFilter));
  }, [appointments, resourceFilter, mode]);
  const groupedResources = useMemo(() => {
    if (!resourceFilter) return allEmployeeResources;
    return allEmployeeResources.filter((resource) => Number(resource.employeeId) === Number(resourceFilter));
  }, [allEmployeeResources, resourceFilter]);

  const paginatedTableRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAppointments.slice(start, start + pageSize);
  }, [filteredAppointments, page]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId, range.start.toISOString(), range.end.toISOString()]);

  useEffect(() => {
    setPage(1);
  }, [resourceFilter, rangeMode, anchorDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [appointmentsData, employeesData, availabilityData, absencesData] = await Promise.all([
        listAppointments({
          accountId: account.accountId,
          dateFrom: mode === "table" ? undefined : range.start.toISOString(),
          dateTo: mode === "table" ? undefined : range.end.toISOString()
        }),
        listEmployees(account.accountId),
        listEmployeeAvailability(account.accountId),
        listEmployeeAbsences(account.accountId, {
          dateFrom: range.start.toISOString().slice(0, 10),
          dateTo: range.end.toISOString().slice(0, 10),
          includeInactive: false
        })
      ]);
      setAppointments(appointmentsData);
      setEmployees(employeesData);
      setAvailabilityRows(availabilityData);
      setAbsenceRows(absencesData);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setLoading(false);
    }
  };

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const closeCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next);
    setCreateDraftStart(null);
    setCreateDraftEmployeeId("");
    setCreateDraftEmployeeName("");
    setCreateAvailabilityAlert("");
  };

  const openCreateAt = (startsAtDate, context = null) => {
    if (!canCreate) return;
    setEditingItem(null);
    setCreateDraftStart(new Date(startsAtDate));
    const employeeId = context?.employeeId ? String(context.employeeId) : "";
    setCreateDraftEmployeeId(employeeId);
    const employeeName = employeeId ? employees.find((item) => String(item.id) === employeeId)?.name || "" : "";
    setCreateDraftEmployeeName(employeeName);
    setCreateAvailabilityAlert(context?.isUnavailable ? t("appointments.unavailableWarning") : "");
    const next = new URLSearchParams(searchParams);
    next.set("create", "1");
    setSearchParams(next);
  };

  const handleSave = async (payload) => {
    try {
      setSaving(true);
      if (editingItem) {
        await updateAppointment(editingItem.id, payload);
      } else {
        await createAppointment({
          ...payload,
          accountId: account.accountId,
          createdById: user.id
        });
      }
      setEditingItem(null);
      closeCreate();
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (row) => {
    try {
      setSaving(true);
      const nextStatus = row.status === "attended" ? "pending" : "attended";
      await updateAppointment(row.id, { status: nextStatus });
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const shiftRangeDate = (direction) => {
    const base = new Date(`${anchorDate}T00:00:00`);
    if (rangeMode === "day") base.setDate(base.getDate() + direction);
    else if (rangeMode === "month") base.setMonth(base.getMonth() + direction);
    else base.setDate(base.getDate() + 7 * direction);
    setParam("date", dateToInput(base));
  };

  const defaultStart = useMemo(() => {
    const base = createDraftStart ? new Date(createDraftStart) : parseLocalDateInput(anchorDate);
    base.setHours(9, 0, 0, 0);
    if (createDraftStart) {
      return createDraftStart.toISOString();
    }
    return base.toISOString();
  }, [anchorDate, createDraftStart]);

  const defaultEnd = useMemo(() => {
    const base = createDraftStart ? new Date(createDraftStart) : parseLocalDateInput(anchorDate);
    if (createDraftStart) {
      base.setMinutes(base.getMinutes() + 60, 0, 0);
    } else {
      base.setHours(10, 0, 0, 0);
    }
    return base.toISOString();
  }, [anchorDate, createDraftStart]);

  const showCalendarControls = mode !== "table";

  return (
    <div className={`module-page appointments-module-page ${mode === "by-employee" ? "is-by-employee" : ""}`.trim()}>
      <h1>{t("appointments.title")}</h1>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="appointments-layout">
        <section className="appointments-content-pane">
          {showCalendarControls ? (
            <div className="appointments-shared-controls">
              <div className="appointments-shared-controls-group">
                {mode !== "by-employee" ? (
                  <button type="button" className={`action-btn ${rangeMode === "day" ? "main" : ""}`} onClick={() => setParam("range", "day")}>
                    {t("appointments.rangeDay")}
                  </button>
                ) : null}
                <button type="button" className={`action-btn ${rangeMode === "week" ? "main" : ""}`} onClick={() => setParam("range", "week")}>
                  {t("appointments.rangeWeek")}
                </button>
                <button type="button" className={`action-btn ${rangeMode === "month" ? "main" : ""}`} onClick={() => setParam("range", "month")}>
                  {t("appointments.rangeMonth")}
                </button>
              </div>
              <div className="appointments-shared-controls-group">
                {mode === "calendar" || mode === "by-employee" ? (
                  <select value={resourceFilter} onChange={(event) => setParam("employeeId", event.target.value)}>
                    <option value="">{`-- ${t("appointments.allResources")} --`}</option>
                    {allEmployeeResources.map((resource) => (
                      <option key={resource.id} value={resource.employeeId}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" className="action-btn" onClick={() => shiftRangeDate(-1)}>
                  {t("common.previous")}
                </button>
                <input type="date" value={anchorDate} onChange={(event) => setParam("date", event.target.value)} />
                <button type="button" className="action-btn" onClick={() => shiftRangeDate(1)}>
                  {t("common.next")}
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <p>{t("common.loading")}</p>
          ) : mode === "table" ? (
            <>
              <table className="crud-table">
                <thead>
                  <tr>
                    <th>{t("appointments.startsAt")}</th>
                    <th>{t("appointments.endsAt")}</th>
                    <th>{t("appointments.client")}</th>
                    <th>{t("appointments.employee")}</th>
                    <th>{t("appointments.reason")}</th>
                    <th>{t("appointments.status")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTableRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.startsAt, language)}</td>
                      <td>{formatDateTime(row.endsAt, language)}</td>
                      <td>{row.persons?.name || "-"}</td>
                      <td>{row.employes?.name || "-"}</td>
                      <td>{row.title}</td>
                      <td>
                        <StatusBadge tone={statusClass(row.status)}>{statusLabel(t, row.status)}</StatusBadge>
                      </td>
                      <td className="table-actions">
                        <RowActionsMenu
                          actions={[
                            ...(canUpdate ? [{ key: "edit", label: t("common.edit"), onClick: () => setEditingItem(row) }] : []),
                            ...(canUpdate
                              ? [{
                              key: "toggle-status",
                              label: row.status === "attended" ? t("appointments.markPending") : t("appointments.markAttended"),
                              onClick: () => handleToggleStatus(row)
                            }]
                              : [])
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageSize={pageSize} totalItems={filteredAppointments.length} onPageChange={setPage} />
            </>
          ) : (
            <div className={`appointments-viewport ${mode === "by-employee" ? "is-by-employee" : ""}`.trim()}>
              {mode === "by-employee" ? (
                <div className="appointments-legend">
                  <span className="appointments-legend-item">
                    <span className="appointments-legend-swatch unavailable" />
                    {t("appointments.unavailableCellLegend")}
                  </span>
                  <span className="appointments-legend-item">
                    <span className="appointments-legend-swatch absence" />
                    {t("appointments.absenceCellLegend")}
                  </span>
                </div>
              ) : null}
              {mode === "by-employee" ? (
                <AppointmentsCalendar
                  groupedByResource
                  resources={groupedResources}
                  appointments={filteredAppointments}
                  availabilityRows={availabilityRows}
                  absenceRows={absenceRows}
                  viewMode={rangeMode}
                  anchorDate={anchorDate}
                  language={language}
                  onSelectAppointment={(item) => {
                    if (canUpdate) setEditingItem(item);
                  }}
                  onCreateAt={openCreateAt}
                />
              ) : (
                <AppointmentsCalendar
                  appointments={filteredAppointments}
                  availabilityRows={availabilityRows}
                  absenceRows={absenceRows}
                  viewMode={rangeMode}
                  anchorDate={anchorDate}
                  language={language}
                  onSelectAppointment={(item) => {
                    if (canUpdate) setEditingItem(item);
                  }}
                  onCreateAt={openCreateAt}
                />
              )}
            </div>
          )}
        </section>
      </div>

      <AppointmentFormModal
        isOpen={(isCreateModalOpen || Boolean(editingItem)) && (canCreate || canUpdate)}
        appointment={editingItem}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        defaultEmployeeId={createDraftEmployeeId}
        defaultEmployeeName={createDraftEmployeeName}
        availabilityAlert={!editingItem ? createAvailabilityAlert : ""}
        onClose={() => {
          setEditingItem(null);
          closeCreate();
        }}
        onSave={handleSave}
        isSaving={saving}
      />
    </div>
  );
}

export default AppointmentsPage;
