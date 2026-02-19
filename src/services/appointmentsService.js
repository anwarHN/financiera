import { supabase } from "../lib/supabase";

const selectColumns =
  'id, accountId, personId, employeeId, title, notes, startsAt, endsAt, status, createdById, persons(name), employes(name)';

export async function listAppointments({ accountId, dateFrom, dateTo, employeeId }) {
  let query = supabase.from("appointments").select(selectColumns).eq("accountId", accountId).order("startsAt", { ascending: true });

  if (dateFrom) query = query.gte("startsAt", dateFrom);
  if (dateTo) query = query.lte("endsAt", dateTo);
  if (employeeId) query = query.eq("employeeId", employeeId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAppointment(payload) {
  const { data, error } = await supabase.from("appointments").insert(payload).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function updateAppointment(id, payload) {
  const { data, error } = await supabase.from("appointments").update(payload).eq("id", id).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function getAppointmentById(id) {
  const { data, error } = await supabase.from("appointments").select(selectColumns).eq("id", id).single();
  if (error) throw error;
  return data;
}

