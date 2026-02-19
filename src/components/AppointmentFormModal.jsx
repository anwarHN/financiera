import { useEffect, useMemo, useState } from "react";
import DateField from "./form/DateField";
import SelectField from "./form/SelectField";
import TextField from "./form/TextField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listEmployees } from "../services/employeesService";
import { listPersons } from "../services/personsService";

const initialForm = {
  personId: "",
  employeeId: "",
  title: "",
  notes: "",
  startsAt: "",
  endsAt: "",
  status: "pending"
};

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function AppointmentFormModal({ isOpen, appointment, defaultStart, defaultEnd, onClose, onSave, isSaving = false }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [persons, setPersons] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState("");

  const clientOptions = useMemo(() => persons.filter((item) => item.type === 1), [persons]);

  useEffect(() => {
    if (!isOpen || !account?.accountId) return;
    loadOptions();
  }, [isOpen, account?.accountId]);

  useEffect(() => {
    if (!isOpen) return;
    if (appointment) {
      setForm({
        personId: appointment.personId ? String(appointment.personId) : "",
        employeeId: appointment.employeeId ? String(appointment.employeeId) : "",
        title: appointment.title || "",
        notes: appointment.notes || "",
        startsAt: toLocalInput(appointment.startsAt),
        endsAt: toLocalInput(appointment.endsAt),
        status: appointment.status || "pending"
      });
    } else {
      setForm({
        ...initialForm,
        startsAt: toLocalInput(defaultStart),
        endsAt: toLocalInput(defaultEnd)
      });
    }
    setError("");
  }, [isOpen, appointment, defaultStart, defaultEnd]);

  const loadOptions = async () => {
    try {
      const [peopleData, employeesData] = await Promise.all([listPersons(account.accountId), listEmployees(account.accountId)]);
      setPersons(peopleData);
      setEmployees(employeesData);
    } catch {
      setPersons([]);
      setEmployees([]);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }

    const startsAt = toIso(form.startsAt);
    const endsAt = toIso(form.endsAt);
    if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError(t("appointments.invalidRange"));
      return;
    }

    await onSave?.({
      personId: Number(form.personId),
      employeeId: form.employeeId ? Number(form.employeeId) : null,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      startsAt,
      endsAt,
      status: form.status
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
        <form className="crud-form" onSubmit={handleSubmit}>
          <h3>{appointment ? t("appointments.edit") : t("appointments.new")}</h3>
          {error ? <p className="error-text">{error}</p> : null}

          <div className="form-grid-2">
            <SelectField
              label={t("appointments.client")}
              name="personId"
              value={form.personId}
              onChange={handleChange}
              required
            >
              <option value="">{`-- ${t("appointments.selectClient")} --`}</option>
              {clientOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label={t("appointments.employee")}
              name="employeeId"
              value={form.employeeId}
              onChange={handleChange}
            >
              <option value="">{`-- ${t("appointments.unassigned")} --`}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </SelectField>

            <TextField label={t("appointments.reason")} name="title" value={form.title} onChange={handleChange} required className="form-span-2" />
            <TextField label={t("appointments.notes")} name="notes" value={form.notes} onChange={handleChange} className="form-span-2" />
            <DateField label={t("appointments.startsAt")} name="startsAt" type="datetime-local" value={form.startsAt} onChange={handleChange} required />
            <DateField label={t("appointments.endsAt")} name="endsAt" type="datetime-local" value={form.endsAt} onChange={handleChange} required />
            <SelectField label={t("appointments.status")} name="status" value={form.status} onChange={handleChange}>
              <option value="pending">{t("appointments.statusPending")}</option>
              <option value="attended">{t("appointments.statusAttended")}</option>
              <option value="missed">{t("appointments.statusMissed")}</option>
              <option value="canceled">{t("appointments.statusCanceled")}</option>
            </SelectField>
          </div>

          <div className="crud-form-actions">
            <button type="button" className="button-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {appointment ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AppointmentFormModal;

