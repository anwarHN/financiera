import { useEffect, useMemo, useRef } from "react";

function toDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return value instanceof Date ? new Date(value) : new Date(value);
}

function startOfDay(value) {
  const d = toDate(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(value) {
  const d = startOfDay(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(value, days) {
  const d = toDate(value);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function isSameMonth(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

function dayLabel(date, language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(toDate(date));
}

function weekdayName(date, language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    weekday: "short"
  }).format(toDate(date));
}

function dayMonthLabel(date, language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    day: "2-digit",
    month: "2-digit"
  }).format(toDate(date));
}

function monthLabel(date, language) {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    month: "short",
    year: "numeric"
  }).format(toDate(date));
}

function formatTime(value) {
  const d = toDate(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeRange(item) {
  return `${formatTime(item.startsAt)} - ${formatTime(item.endsAt)}`;
}

function buildWeekDays(anchorDate) {
  const start = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function buildMonthCells(anchorDate) {
  const monthStart = startOfDay(toDate(anchorDate));
  monthStart.setDate(1);
  const monthEnd = startOfDay(new Date(monthStart));
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
  const firstCell = startOfWeek(monthStart);

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(firstCell, i);
    cells.push({ date, inCurrentMonth: isSameMonth(date, monthStart) });
  }
  return cells;
}

function buildYearMonths(anchorDate) {
  const start = startOfDay(toDate(anchorDate));
  start.setMonth(0, 1);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start);
    d.setMonth(i, 1);
    return d;
  });
}

function buildWeekHours() {
  return Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 === 0 ? 0 : 30;
    return { hour, minute, label: minute === 0 ? String(hour).padStart(2, "0") : "" };
  });
}

const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 26;
const DAY_SLOTS = (24 * 60) / SLOT_MINUTES;

function dateKey(value) {
  return toDate(value).toISOString().slice(0, 10);
}

function minuteOfTimeText(value) {
  if (!value || typeof value !== "string") return null;
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function normalizeAvailabilityRanges(rows) {
  const map = new Map();
  (rows ?? []).forEach((row) => {
    const employeeId = Number(row.employeeId);
    const dayOfWeek = Number(row.dayOfWeek);
    if (!employeeId && employeeId !== 0) return;
    if (Number.isNaN(dayOfWeek)) return;
    const startMinute = minuteOfTimeText(String(row.startTime || "").slice(0, 5));
    const endMinute = minuteOfTimeText(String(row.endTime || "").slice(0, 5));
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return;

    if (!map.has(employeeId)) map.set(employeeId, new Map());
    const employeeDays = map.get(employeeId);
    if (!employeeDays.has(dayOfWeek)) employeeDays.set(dayOfWeek, []);
    employeeDays.get(dayOfWeek).push({ startMinute, endMinute });
  });

  map.forEach((dayMap) => {
    dayMap.forEach((ranges, day) => {
      const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
      dayMap.set(day, sorted);
    });
  });

  return map;
}

function normalizeAbsenceDateSets(rows) {
  const map = new Map();
  (rows ?? []).forEach((row) => {
    const employeeId = Number(row.employeeId);
    if (!employeeId && employeeId !== 0) return;
    const from = row.dateFrom ? new Date(`${row.dateFrom}T00:00:00`) : null;
    const to = row.dateTo ? new Date(`${row.dateTo}T00:00:00`) : null;
    if (!from || Number.isNaN(from.getTime())) return;
    if (!to || Number.isNaN(to.getTime())) return;
    if (!map.has(employeeId)) map.set(employeeId, new Set());

    const cursor = new Date(from);
    const maxLoops = 5000;
    let loops = 0;
    while (cursor <= to && loops < maxLoops) {
      map.get(employeeId).add(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
      loops += 1;
    }
  });
  return map;
}

function getUnavailableBlocks({ employeeId, dayDate, availabilityByEmployeeDay, absencesByEmployeeDate }) {
  const absenceSet = absencesByEmployeeDate.get(Number(employeeId));
  if (absenceSet?.has(dateKey(dayDate))) {
    return [{ top: 0, height: DAY_SLOTS * SLOT_HEIGHT, type: "absence" }];
  }

  const employeeDays = availabilityByEmployeeDay.get(Number(employeeId));
  const dayRanges = employeeDays?.get(toDate(dayDate).getDay()) || [];

  if (dayRanges.length === 0) {
    return [{ top: 0, height: DAY_SLOTS * SLOT_HEIGHT, type: "unavailable" }];
  }

  const availableSlots = Array.from({ length: DAY_SLOTS }, () => false);
  dayRanges.forEach((range) => {
    for (let index = 0; index < DAY_SLOTS; index += 1) {
      const slotStartMinute = index * SLOT_MINUTES;
      const slotEndMinute = slotStartMinute + SLOT_MINUTES;
      if (slotStartMinute >= range.startMinute && slotEndMinute <= range.endMinute) {
        availableSlots[index] = true;
      }
    }
  });

  const blocks = [];
  let currentStart = null;
  for (let index = 0; index < DAY_SLOTS; index += 1) {
    if (!availableSlots[index] && currentStart === null) {
      currentStart = index;
    }
    if ((availableSlots[index] || index === DAY_SLOTS - 1) && currentStart !== null) {
      const endIndex = availableSlots[index] ? index : index + 1;
      blocks.push({
        top: currentStart * SLOT_HEIGHT,
        height: Math.max(1, (endIndex - currentStart) * SLOT_HEIGHT),
        type: "unavailable"
      });
      currentStart = null;
    }
  }
  return blocks;
}

function isSlotUnavailable({ employeeId, dayDate, slot, availabilityByEmployeeDay, absencesByEmployeeDate }) {
  const absenceSet = absencesByEmployeeDate.get(Number(employeeId));
  if (absenceSet?.has(dateKey(dayDate))) return true;

  const employeeDays = availabilityByEmployeeDay.get(Number(employeeId));
  const dayRanges = employeeDays?.get(toDate(dayDate).getDay()) || [];
  if (dayRanges.length === 0) return true;

  const slotStartMinute = slot * SLOT_MINUTES;
  const slotEndMinute = slotStartMinute + SLOT_MINUTES;
  const isAvailable = dayRanges.some((range) => slotStartMinute >= range.startMinute && slotEndMinute <= range.endMinute);
  return !isAvailable;
}

function slotIndex(dateValue) {
  const d = toDate(dateValue);
  return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
}

function eventSlotHeight(item) {
  const start = toDate(item.startsAt);
  const end = toDate(item.endsAt);
  const minutes = Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
  return Math.max(1, Math.ceil(minutes / SLOT_MINUTES));
}

function AppointmentPill({ item, onSelect }) {
  return (
    <button
      type="button"
      className="appointments-pill"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
    >
      <strong>{formatTimeRange(item)}</strong>
      <span>{item.persons?.name || "-"}</span>
      <small>{item.title || "-"}</small>
    </button>
  );
}

function CalendarBody({ appointments, viewMode, anchorDate, language, onSelectAppointment, absenceDateSet, onCreateAt }) {
  const sorted = useMemo(
    () => [...appointments].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments]
  );

  if (viewMode === "day") {
    const day = startOfDay(anchorDate);
    const rows = Array.from({ length: 24 }, (_, hour) => {
      const bucket = sorted.filter((item) => {
        const start = toDate(item.startsAt);
        return isSameDay(start, day) && start.getHours() === hour;
      });
      return { hour, bucket };
    });

    return (
      <div className="appointments-day-grid">
        {rows.map((row) => (
          <div key={`hour-${row.hour}`} className="appointments-day-row">
            <div className="appointments-day-hour">{`${String(row.hour).padStart(2, "0")}:00`}</div>
            <div
              className="appointments-day-slot"
              onClick={() => {
                if (!onCreateAt) return;
                const startsAt = new Date(day);
                startsAt.setHours(row.hour, 0, 0, 0);
                onCreateAt(startsAt);
              }}
            >
              {row.bucket.map((item) => (
                <AppointmentPill key={`day-pill-${item.id}`} item={item} onSelect={onSelectAppointment} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === "week") {
    const days = buildWeekDays(anchorDate);
    return (
      <div className="appointments-week-grid">
        {days.map((date) => {
          const bucket = sorted.filter((item) => isSameDay(item.startsAt, date));
          return (
            <div key={`week-${date.toISOString()}`} className="appointments-calendar-cell">
              <div className="appointments-calendar-cell-head">{dayLabel(date, language)}</div>
              <div
                className="appointments-calendar-cell-body"
                onClick={() => {
                  if (!onCreateAt) return;
                  const startsAt = new Date(date);
                  startsAt.setHours(9, 0, 0, 0);
                  onCreateAt(startsAt);
                }}
              >
                {bucket.map((item) => (
                  <AppointmentPill key={`week-pill-${item.id}`} item={item} onSelect={onSelectAppointment} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (viewMode === "month") {
    const cells = buildMonthCells(anchorDate);
    return (
      <div className="appointments-month-grid">
        {cells.map((cell) => {
          const bucket = sorted.filter((item) => isSameDay(item.startsAt, cell.date));
          const isAbsenceDate = absenceDateSet?.has(dateKey(cell.date));
          return (
            <div
              key={`month-${cell.date.toISOString()}`}
              className={`appointments-calendar-cell ${cell.inCurrentMonth ? "" : "is-outside-month"} ${isAbsenceDate ? "is-absence-date" : ""}`.trim()}
              onClick={() => {
                if (!onCreateAt) return;
                const startsAt = new Date(cell.date);
                startsAt.setHours(9, 0, 0, 0);
                onCreateAt(startsAt);
              }}
            >
              <div className="appointments-calendar-cell-head">{String(cell.date.getDate()).padStart(2, "0")}</div>
              <div className="appointments-calendar-cell-body">
                {bucket.slice(0, 4).map((item) => (
                  <AppointmentPill key={`month-pill-${item.id}`} item={item} onSelect={onSelectAppointment} />
                ))}
                {bucket.length > 4 ? <small className="appointments-more">+{bucket.length - 4}</small> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const months = buildYearMonths(anchorDate);
  return (
    <div className="appointments-year-grid">
      {months.map((month) => {
        const bucket = sorted.filter((item) => isSameMonth(item.startsAt, month));
        return (
          <div key={`year-${month.toISOString()}`} className="appointments-calendar-cell">
            <div className="appointments-calendar-cell-head">{monthLabel(month, language)}</div>
            <div className="appointments-calendar-cell-body">
              {bucket.slice(0, 5).map((item) => (
                <AppointmentPill key={`year-pill-${item.id}`} item={item} onSelect={onSelectAppointment} />
              ))}
              {bucket.length > 5 ? <small className="appointments-more">+{bucket.length - 5}</small> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupedGrid({
  appointments,
  resources,
  viewMode,
  anchorDate,
  language,
  onSelectAppointment,
  onCreateAt,
  availabilityRows,
  absenceRows
}) {
  const wrapRef = useRef(null);
  const sorted = useMemo(() => [...appointments].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [appointments]);
  const availabilityByEmployeeDay = useMemo(() => normalizeAvailabilityRanges(availabilityRows), [availabilityRows]);
  const absencesByEmployeeDate = useMemo(() => normalizeAbsenceDateSets(absenceRows), [absenceRows]);

  if (viewMode === "month") {
    return (
      <div className="appointments-grouped-month-wrap">
        {resources.map((resource) => {
          const resourceAppointments = sorted.filter((item) => Number(item.employeeId) === Number(resource.employeeId));
          const absenceDateSet = absencesByEmployeeDate.get(Number(resource.employeeId));
          return (
            <section key={`month-resource-${resource.id}`} className="appointments-grouped-month-resource">
              <h3>{resource.name}</h3>
              <CalendarBody
                appointments={resourceAppointments}
                viewMode="month"
                anchorDate={anchorDate}
                language={language}
                onSelectAppointment={onSelectAppointment}
                absenceDateSet={absenceDateSet}
                onCreateAt={onCreateAt}
              />
            </section>
          );
        })}
      </div>
    );
  }

  const weekDays = buildWeekDays(anchorDate);
  const weekHours = buildWeekHours();

  useEffect(() => {
    if (viewMode !== "week" || !wrapRef.current) return;
    const defaultSlot = 16;
    const earliestSlot = sorted.length > 0 ? Math.max(0, Math.min(...sorted.map((item) => slotIndex(item.startsAt)))) : null;
    const targetSlot = earliestSlot === null ? defaultSlot : Math.min(defaultSlot, earliestSlot);
    wrapRef.current.scrollTop = Math.max(0, targetSlot * SLOT_HEIGHT);
  }, [viewMode, sorted, anchorDate]);

  return (
    <div className="appointments-grouped-week-wrap" ref={wrapRef} data-tour="appointments-by-employee-grid">
      <div className="appointments-grouped-time-col">
        <div className="appointments-grouped-time-head">{language === "es" ? "Hora" : "Hour"}</div>
        <div className="appointments-grouped-time-body">
          {weekHours.map((slot) => (
            <div key={`time-slot-${slot.hour}-${slot.minute}`} className="appointments-grouped-time-cell" style={{ height: `${SLOT_HEIGHT}px` }}>
              {slot.label}
            </div>
          ))}
        </div>
      </div>
      <div className="appointments-grouped-week-scroll">
        <div className="appointments-grouped-week-resources">
          {resources.map((resource) => {
            const resourceAppointments = sorted.filter((item) => Number(item.employeeId) === Number(resource.employeeId));
            return (
              <section key={`week-resource-${resource.id}`} className="appointments-grouped-week-resource">
                <header className="appointments-grouped-week-resource-head">{resource.name}</header>
                <div className="appointments-grouped-week-days-head">
                  {weekDays.map((date) => (
                    <div key={`week-day-head-${resource.id}-${date.toISOString()}`} className="appointments-grouped-week-day-head-cell">
                      <strong>{weekdayName(date, language)}</strong>
                      <span>{dayMonthLabel(date, language)}</span>
                    </div>
                  ))}
                </div>
                <div className="appointments-grouped-week-days-body" style={{ height: `${DAY_SLOTS * SLOT_HEIGHT}px` }}>
                  {weekDays.map((date) => {
                    const bucket = resourceAppointments.filter((item) => isSameDay(item.startsAt, date));
                    const blocks = getUnavailableBlocks({
                      employeeId: resource.employeeId,
                      dayDate: date,
                      availabilityByEmployeeDay,
                      absencesByEmployeeDate
                    });
                    return (
                      <div key={`week-day-body-${resource.id}-${date.toISOString()}`} className="appointments-grouped-week-day-col">
                        <div className="appointments-slot-overlays">
                          {blocks.map((block, index) => (
                            <div
                              key={`slot-overlay-${resource.id}-${date.toISOString()}-${index}`}
                              className={`appointments-slot-overlay ${block.type === "absence" ? "is-absence" : "is-unavailable"}`}
                              style={{ top: `${block.top}px`, height: `${block.height}px` }}
                            />
                          ))}
                        </div>
                        {bucket.map((item) => {
                          const top = slotIndex(item.startsAt) * SLOT_HEIGHT;
                          const height = eventSlotHeight(item) * SLOT_HEIGHT - 2;
                          return (
                            <button
                              key={`week-float-${resource.id}-${date.toISOString()}-${item.id}`}
                              type="button"
                              className="appointments-float-event"
                              style={{ top: `${top}px`, height: `${height}px` }}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectAppointment(item);
                              }}
                            >
                              <strong>{item.persons?.name || "-"}</strong>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="appointments-grouped-create-hitbox"
                          onClick={(event) => {
                            if (!onCreateAt) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const rawY = event.clientY - rect.top;
                            const slot = Math.max(0, Math.min(DAY_SLOTS - 1, Math.floor(rawY / SLOT_HEIGHT)));
                            const startsAt = new Date(date);
                            startsAt.setHours(0, slot * SLOT_MINUTES, 0, 0);
                            onCreateAt(startsAt, {
                              employeeId: resource.employeeId,
                              isUnavailable: isSlotUnavailable({
                                employeeId: resource.employeeId,
                                dayDate: date,
                                slot,
                                availabilityByEmployeeDay,
                                absencesByEmployeeDate
                              })
                            });
                          }}
                          aria-label="Create appointment"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AppointmentsCalendar({
  appointments,
  resources,
  groupedByResource = false,
  viewMode,
  anchorDate,
  language,
  onSelectAppointment,
  onCreateAt,
  availabilityRows,
  absenceRows
}) {
  if (!groupedByResource) {
    return (
      <div className="appointments-calendar-wrap">
        <CalendarBody
          appointments={appointments}
          viewMode={viewMode}
          anchorDate={anchorDate}
          language={language}
          onSelectAppointment={onSelectAppointment}
          onCreateAt={onCreateAt}
        />
      </div>
    );
  }

  return (
    <GroupedGrid
      appointments={appointments}
      resources={resources}
      viewMode={viewMode}
      anchorDate={anchorDate}
      language={language}
      onSelectAppointment={onSelectAppointment}
      onCreateAt={onCreateAt}
      availabilityRows={availabilityRows}
      absenceRows={absenceRows}
    />
  );
}
