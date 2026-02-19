import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { Scheduler, SchedulerData, ViewType, DATE_FORMAT, wrapperFun } from "react-big-schedule";
import "react-big-schedule/dist/css/style.css";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import AppointmentFormModal from "../components/AppointmentFormModal";
import RowActionsMenu from "../components/RowActionsMenu";
import DateField from "../components/form/DateField";
import SelectField from "../components/form/SelectField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createAppointment, listAppointments, updateAppointment } from "../services/appointmentsService";
import { listEmployees } from "../services/employeesService";
import { formatDateTime } from "../utils/dateFormat";

const pageSize = 10;
const SchedulerWithDnD = wrapperFun(Scheduler);

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfMonth(date) {
  const copy = new Date(date);
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
  const base = new Date(anchorDate);
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
  const end = addDays(start, 6);
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

function statusColor(status) {
  if (status === "attended") return "#16a34a";
  if (status === "missed") return "#dc2626";
  if (status === "canceled") return "#64748b";
  return "#eab308";
}

function mapRangeModeToViewType(rangeMode) {
  if (rangeMode === "day") return ViewType.Day;
  if (rangeMode === "month") return ViewType.Month;
  return ViewType.Week;
}

function mapViewTypeToRangeMode(viewType) {
  if (viewType === ViewType.Day) return "day";
  if (viewType === ViewType.Month) return "month";
  return "week";
}

function buildSchedulerData({ t, language, rangeMode, anchorDate, resources, events, configOverrides }) {
  const viewType = mapRangeModeToViewType(rangeMode);
  const schedulerData = new SchedulerData(anchorDate, viewType, false, false, {
    schedulerWidth: "100%",
    schedulerContentHeight: "430px",
    headerEnabled: true,
    creatable: false,
    checkConflict: false,
    views: [
      { viewName: t("appointments.rangeDay"), viewType: ViewType.Day, showAgenda: false, isEventPerspective: false },
      { viewName: t("appointments.rangeWeek"), viewType: ViewType.Week, showAgenda: false, isEventPerspective: false },
      { viewName: t("appointments.rangeMonth"), viewType: ViewType.Month, showAgenda: false, isEventPerspective: false }
    ],
    ...configOverrides
  });

  schedulerData.setSchedulerLocale(language === "es" ? "es" : "en");
  schedulerData.setResources(resources);
  schedulerData.setEvents(events);

  return schedulerData;
}

function AppointmentsSchedule({
  t,
  language,
  rangeMode,
  anchorDate,
  resources,
  headerResources,
  appointments,
  onEdit,
  onMove,
  onResizeStart,
  onResizeEnd,
  onPrev,
  onNext,
  onViewChange,
  onSelectDate,
  onChangeRangeMode,
  onChangeResourceFilter,
  resourceFilter
}) {
  const schedulerEvents = useMemo(
    () =>
      [...appointments]
        .filter((item) => Boolean(item.employeeId))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .map((item) => ({
          id: item.id,
          start: dayjs(item.startsAt).format("YYYY-MM-DD HH:mm:ss"),
          end: dayjs(item.endsAt).format("YYYY-MM-DD HH:mm:ss"),
          resourceId: `emp-${item.employeeId}`,
          title: `${item.persons?.name || "-"} | ${item.title}`,
          bgColor: statusColor(item.status)
        })),
    [appointments]
  );

  const leftCustomHeader = (
    <div className="appointments-scheduler-header appointments-scheduler-header-left">
      <button
        type="button"
        className={`button-secondary ${rangeMode === "day" ? "active" : ""}`}
        onClick={() => onChangeRangeMode("day")}
      >
        {t("appointments.rangeDay")}
      </button>
      <button
        type="button"
        className={`button-secondary ${rangeMode === "week" ? "active" : ""}`}
        onClick={() => onChangeRangeMode("week")}
      >
        {t("appointments.rangeWeek")}
      </button>
      <button
        type="button"
        className={`button-secondary ${rangeMode === "month" ? "active" : ""}`}
        onClick={() => onChangeRangeMode("month")}
      >
        {t("appointments.rangeMonth")}
      </button>
    </div>
  );

  const rightCustomHeader = (
    <div className="appointments-scheduler-header appointments-scheduler-header-right">
      <span>{t("appointments.resourceFilter")}</span>
      <select value={resourceFilter} onChange={(event) => onChangeResourceFilter(event.target.value)}>
        <option value="">{`-- ${t("appointments.allResources")} --`}</option>
        {headerResources.map((resource) => (
          <option key={resource.id} value={resource.employeeId}>
            {resource.name}
          </option>
        ))}
      </select>
    </div>
  );

  const schedulerData = useMemo(
    () =>
      buildSchedulerData({
        t,
        language,
        rangeMode,
        anchorDate,
        resources,
        events: schedulerEvents
      }),
    [t, language, rangeMode, anchorDate, resources, schedulerEvents]
  );

  return (
    <div className="appointments-scheduler-wrap">
      <SchedulerWithDnD
        schedulerData={schedulerData}
        prevClick={onPrev}
        nextClick={onNext}
        onViewChange={onViewChange}
        onSelectDate={onSelectDate}
        leftCustomHeader={leftCustomHeader}
        rightCustomHeader={rightCustomHeader}
        eventItemClick={onEdit}
        moveEvent={onMove}
        updateEventStart={onResizeStart}
        updateEventEnd={onResizeEnd}
      />
    </div>
  );
}

function AppointmentsPage({ mode = "calendar" }) {
  const { t, language } = useI18n();
  const { account, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [editingItem, setEditingItem] = useState(null);

  const isCreateModalOpen = searchParams.get("create") === "1";
  const rangeMode = searchParams.get("range") || "week";
  const anchorDate = searchParams.get("date") || dateToInput(new Date());
  const resourceFilter = searchParams.get("employeeId") || "";

  const range = useMemo(() => buildRange(anchorDate, rangeMode), [anchorDate, rangeMode]);
  const allEmployeeResources = useMemo(
    () => employees.map((item) => ({ id: `emp-${item.id}`, name: item.name, employeeId: item.id })),
    [employees]
  );

  const resources = useMemo(() => {
    if (!resourceFilter) return allEmployeeResources;
    return allEmployeeResources.filter((item) => item.employeeId === Number(resourceFilter));
  }, [allEmployeeResources, resourceFilter]);

  const filteredAppointments = useMemo(() => {
    if (!resourceFilter) return appointments;
    return appointments.filter((item) => Number(item.employeeId) === Number(resourceFilter));
  }, [appointments, resourceFilter]);

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
      const [appointmentsData, employeesData] = await Promise.all([
        listAppointments({
          accountId: account.accountId,
          dateFrom: range.start.toISOString(),
          dateTo: range.end.toISOString()
        }),
        listEmployees(account.accountId)
      ]);
      setAppointments(appointmentsData);
      setEmployees(employeesData);
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

  const goRelative = (direction) => {
    const base = new Date(anchorDate);
    if (rangeMode === "day") base.setDate(base.getDate() + direction);
    if (rangeMode === "week") base.setDate(base.getDate() + direction * 7);
    if (rangeMode === "month") base.setMonth(base.getMonth() + direction);
    setParam("date", dateToInput(base));
  };

  const closeCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
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

  const findAppointmentByEvent = (event) => {
    const eventId = Number(event?.id);
    return appointments.find((item) => Number(item.id) === eventId) ?? null;
  };

  const handleEditFromScheduler = (_, event) => {
    const row = findAppointmentByEvent(event);
    if (row) setEditingItem(row);
  };

  const updateFromScheduler = async ({ event, slotId, newStart, newEnd, mode: updateMode }) => {
    const row = findAppointmentByEvent(event);
    if (!row) return;

    const employeeId = slotId === undefined ? row.employeeId : Number(String(slotId).replace("emp-", ""));

    const payload = {
      employeeId,
      startsAt: newStart ? dayjs(newStart).toISOString() : row.startsAt,
      endsAt: newEnd ? dayjs(newEnd).toISOString() : row.endsAt
    };

    try {
      setSaving(true);
      await updateAppointment(row.id, payload);
      await loadData();
    } catch {
      setError(updateMode === "move" ? t("common.genericSaveError") : t("common.genericSaveError"));
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

  const handleSchedulerPrev = (schedulerData) => {
    schedulerData.prev();
    setParam("date", schedulerData.startDate.format(DATE_FORMAT));
  };

  const handleSchedulerNext = (schedulerData) => {
    schedulerData.next();
    setParam("date", schedulerData.startDate.format(DATE_FORMAT));
  };

  const handleSchedulerViewChange = (_, view) => {
    setParam("range", mapViewTypeToRangeMode(view.viewType));
  };

  const handleSchedulerSelectDate = (_, date) => {
    setParam("date", dayjs(date).format(DATE_FORMAT));
  };

  const defaultStart = useMemo(() => {
    const base = new Date(anchorDate);
    base.setHours(9, 0, 0, 0);
    return base.toISOString();
  }, [anchorDate]);

  const defaultEnd = useMemo(() => {
    const base = new Date(anchorDate);
    base.setHours(10, 0, 0, 0);
    return base.toISOString();
  }, [anchorDate]);

  return (
    <div className="module-page">
      <h1>{t("appointments.title")}</h1>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="appointments-layout">
        <aside className="appointments-filters-pane">
          <div className="crud-form appointments-filters-form">
            <SelectField label={t("appointments.range")} value={rangeMode} onChange={(e) => setParam("range", e.target.value)}>
              <option value="day">{t("appointments.rangeDay")}</option>
              <option value="week">{t("appointments.rangeWeek")}</option>
              <option value="month">{t("appointments.rangeMonth")}</option>
            </SelectField>
            <SelectField label={t("appointments.resourceFilter")} value={resourceFilter} onChange={(e) => setParam("employeeId", e.target.value)}>
              <option value="">{`-- ${t("appointments.allResources")} --`}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </SelectField>
            <DateField label={t("appointments.anchorDate")} value={anchorDate} onChange={(e) => setParam("date", e.target.value)} />
            <div className="crud-form-actions">
              <button type="button" className="button-secondary" onClick={() => goRelative(-1)}>
                {t("common.previous")}
              </button>
              <button type="button" className="button-secondary" onClick={() => goRelative(1)}>
                {t("common.next")}
              </button>
            </div>
          </div>
        </aside>

        <section className="appointments-content-pane">
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
                        <span className={`status-pill ${statusClass(row.status)}`}>{statusLabel(t, row.status)}</span>
                      </td>
                      <td className="table-actions">
                        <RowActionsMenu
                          actions={[
                            {
                              key: "edit",
                              label: t("common.edit"),
                              onClick: () => setEditingItem(row)
                            },
                            {
                              key: "toggle-status",
                              label: row.status === "attended" ? t("appointments.markPending") : t("appointments.markAttended"),
                              onClick: () => handleToggleStatus(row)
                            }
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageSize={pageSize} totalItems={filteredAppointments.length} onPageChange={setPage} />
            </>
          ) : mode === "by-employee" ? (
            <div className="appointments-cards-grid">
              {resources.map((resource) => (
                <section key={resource.id} className="generic-panel appointments-resource-column">
                  <h3>{resource.name}</h3>
                  <AppointmentsSchedule
                    t={t}
                    language={language}
                    rangeMode={rangeMode}
                    anchorDate={anchorDate}
                    resources={[resource]}
                    headerResources={allEmployeeResources}
                    appointments={filteredAppointments}
                    onEdit={handleEditFromScheduler}
                    onMove={(schedulerData, event, slotId, _slotName, newStart, newEnd) =>
                      updateFromScheduler({ schedulerData, event, slotId, newStart, newEnd, mode: "move" })
                    }
                    onResizeStart={(schedulerData, event, newStart) =>
                      updateFromScheduler({ schedulerData, event, slotId: event.resourceId, newStart, mode: "resize-start" })
                    }
                    onResizeEnd={(schedulerData, event, newEnd) =>
                      updateFromScheduler({ schedulerData, event, slotId: event.resourceId, newEnd, mode: "resize-end" })
                    }
                    onPrev={handleSchedulerPrev}
                    onNext={handleSchedulerNext}
                    onViewChange={handleSchedulerViewChange}
                    onSelectDate={handleSchedulerSelectDate}
                    onChangeRangeMode={(value) => setParam("range", value)}
                    onChangeResourceFilter={(value) => setParam("employeeId", value)}
                    resourceFilter={resourceFilter}
                  />
                </section>
              ))}
            </div>
          ) : (
            <AppointmentsSchedule
              t={t}
              language={language}
              rangeMode={rangeMode}
              anchorDate={anchorDate}
              resources={resources}
              headerResources={allEmployeeResources}
              appointments={filteredAppointments}
              onEdit={handleEditFromScheduler}
              onMove={(schedulerData, event, slotId, _slotName, newStart, newEnd) =>
                updateFromScheduler({ schedulerData, event, slotId, newStart, newEnd, mode: "move" })
              }
              onResizeStart={(schedulerData, event, newStart) =>
                updateFromScheduler({ schedulerData, event, slotId: event.resourceId, newStart, mode: "resize-start" })
              }
              onResizeEnd={(schedulerData, event, newEnd) =>
                updateFromScheduler({ schedulerData, event, slotId: event.resourceId, newEnd, mode: "resize-end" })
              }
              onPrev={handleSchedulerPrev}
              onNext={handleSchedulerNext}
              onViewChange={handleSchedulerViewChange}
              onSelectDate={handleSchedulerSelectDate}
              onChangeRangeMode={(value) => setParam("range", value)}
              onChangeResourceFilter={(value) => setParam("employeeId", value)}
              resourceFilter={resourceFilter}
            />
          )}
        </section>
      </div>

      <AppointmentFormModal
        isOpen={isCreateModalOpen || Boolean(editingItem)}
        appointment={editingItem}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
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
