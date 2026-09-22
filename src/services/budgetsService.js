import { supabase } from "../lib/supabase";
import { loadBudgetExecution } from "../../supabase/functions/_shared/budgetExecution.js";
import { fetchAllPages } from "../../supabase/functions/_shared/fetchAllPages.js";

const budgetColumns =
  'id, name, "periodType", "periodStart", "periodEnd", "projectId", "currencyId", "isActive", projects(name), currencies(name, symbol)';

export async function listBudgets(accountId, { activeOnly = true } = {}) {
  let query = supabase.from("budgets").select(budgetColumns).eq("accountId", accountId);
  if (activeOnly) {
    query = query.eq("isActive", true);
  }
  return fetchAllPages((from, to) => query.order("id", { ascending: false }).range(from, to));
}

export async function getBudgetById(id, accountId) {
  const { data, error } = await supabase
    .from("budgets")
    .select(budgetColumns)
    .eq("accountId", accountId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listBudgetLines(budgetId) {
  return fetchAllPages((from, to) => supabase
    .from("budget_lines")
    .select('id, "budgetId", "conceptId", amount, concepts(name)')
    .eq("budgetId", budgetId)
    .order("id", { ascending: true }).range(from, to));
}

export async function createBudgetWithLines({ budget, lines }) {
  const { data: createdBudget, error: budgetError } = await supabase.from("budgets").insert(budget).select("id").single();
  if (budgetError) throw budgetError;

  const payloadLines = (lines ?? [])
    .filter((line) => Number(line.conceptId))
    .map((line) => ({
      budgetId: createdBudget.id,
      conceptId: Number(line.conceptId),
      amount: Number(line.amount || 0),
      createdById: budget.createdById
    }));

  if (payloadLines.length > 0) {
    const { error: linesError } = await supabase.from("budget_lines").insert(payloadLines);
    if (linesError) {
      await supabase.from("budgets").delete().eq("id", createdBudget.id);
      throw linesError;
    }
  }

  return createdBudget;
}

export async function updateBudgetWithLines(id, { budget, lines }) {
  const { error: budgetError } = await supabase.from("budgets").update(budget)
    .eq("id", id).eq("accountId", budget.accountId).select("id").single();
  if (budgetError) throw budgetError;

  const { error: deleteError } = await supabase.from("budget_lines").delete().eq("budgetId", id);
  if (deleteError) throw deleteError;

  const payloadLines = (lines ?? [])
    .filter((line) => Number(line.conceptId))
    .map((line) => ({
      budgetId: id,
      conceptId: Number(line.conceptId),
      amount: Number(line.amount || 0),
      createdById: budget.createdById
    }));

  if (payloadLines.length > 0) {
    const { error: linesError } = await supabase.from("budget_lines").insert(payloadLines);
    if (linesError) throw linesError;
  }
}

export async function deactivateBudget(id) {
  const { error } = await supabase.from("budgets").update({ isActive: false }).eq("id", id);
  if (error) throw error;
}

export const getBudgetExecutionReport = (filters) => loadBudgetExecution(supabase, filters);
export const getProjectExecutionReport = (filters) => loadBudgetExecution(supabase, filters);
