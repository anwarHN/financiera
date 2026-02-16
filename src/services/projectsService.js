import { supabase } from "../lib/supabase";

const selectColumns = 'id, name, description, "startDate", "endDate", "isActive"';

export async function listProjects(accountId, { activeOnly = true } = {}) {
  let query = supabase.from("projects").select(selectColumns).eq("accountId", accountId);
  if (activeOnly) {
    query = query.eq("isActive", true);
  }
  const { data, error } = await query.order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(id) {
  const { data, error } = await supabase.from("projects").select(selectColumns).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createProject(payload) {
  const { data, error } = await supabase.from("projects").insert(payload).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, payload) {
  const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function deactivateProject(id) {
  const { error } = await supabase.from("projects").update({ isActive: false }).eq("id", id);
  if (error) throw error;
}
