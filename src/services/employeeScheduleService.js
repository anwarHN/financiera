import { supabase } from "../lib/supabase";

const availabilitySelect = 'id, "accountId", "employeeId", "dayOfWeek", "startTime", "endTime", "isActive"';
const absenceSelect = 'id, "accountId", "employeeId", "dateFrom", "dateTo", reason, "isActive", employes(name)';

export async function listEmployeeAvailability(accountId) {
  const { data, error } = await supabase
    .from("employee_availability")
    .select(availabilitySelect)
    .eq("accountId", accountId)
    .eq("isActive", true)
    .order("employeeId", { ascending: true })
    .order("dayOfWeek", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listEmployeeAvailabilityByEmployee(employeeId) {
  const { data, error } = await supabase
    .from("employee_availability")
    .select(availabilitySelect)
    .eq("employeeId", employeeId)
    .eq("isActive", true)
    .order("dayOfWeek", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function replaceEmployeeAvailability({ accountId, employeeId, createdById, rows }) {
  const { error: deleteError } = await supabase.from("employee_availability").delete().eq("employeeId", employeeId);
  if (deleteError) throw deleteError;

  const sanitized = (rows ?? [])
    .filter((row) => row.isAvailable && row.startTime && row.endTime)
    .map((row) => ({
      accountId,
      employeeId,
      dayOfWeek: Number(row.dayOfWeek),
      startTime: row.startTime,
      endTime: row.endTime,
      createdById,
      isActive: true
    }));

  if (sanitized.length === 0) return [];

  const { data, error } = await supabase.from("employee_availability").insert(sanitized).select(availabilitySelect);
  if (error) throw error;
  return data ?? [];
}

export async function listEmployeeAbsences(accountId, { dateFrom, dateTo, employeeId, includeInactive = false } = {}) {
  let query = supabase.from("employee_absences").select(absenceSelect).eq("accountId", accountId).order("dateFrom", { ascending: false });

  if (!includeInactive) query = query.eq("isActive", true);
  if (employeeId) query = query.eq("employeeId", Number(employeeId));
  if (dateFrom) query = query.lte("dateFrom", dateTo || "9999-12-31").gte("dateTo", dateFrom);
  if (dateTo && !dateFrom) query = query.lte("dateFrom", dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createEmployeeAbsence(payload) {
  const { data, error } = await supabase.from("employee_absences").insert(payload).select(absenceSelect).single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeAbsence(id, payload) {
  const { data, error } = await supabase.from("employee_absences").update(payload).eq("id", id).select(absenceSelect).single();
  if (error) throw error;
  return data;
}

export async function deactivateEmployeeAbsence(id) {
  const { data, error } = await supabase
    .from("employee_absences")
    .update({ isActive: false })
    .eq("id", id)
    .select(absenceSelect)
    .single();
  if (error) throw error;
  return data;
}
