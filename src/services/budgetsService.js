import { supabase } from "../lib/supabase";

const budgetColumns =
  'id, name, "periodType", "periodStart", "periodEnd", "projectId", "isActive", projects(name)';

export async function listBudgets(accountId, { activeOnly = true } = {}) {
  let query = supabase.from("budgets").select(budgetColumns).eq("accountId", accountId);
  if (activeOnly) {
    query = query.eq("isActive", true);
  }
  const { data, error } = await query.order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBudgetById(id) {
  const { data, error } = await supabase
    .from("budgets")
    .select('id, name, "periodType", "periodStart", "periodEnd", "projectId", "isActive"')
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listBudgetLines(budgetId) {
  const { data, error } = await supabase
    .from("budget_lines")
    .select('id, "budgetId", "conceptId", amount, concepts(name)')
    .eq("budgetId", budgetId)
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
  const { error: budgetError } = await supabase.from("budgets").update(budget).eq("id", id);
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

export async function getBudgetExecutionReport({ accountId, budgetId, dateFrom, dateTo }) {
  const { data: budget, error: budgetError } = await supabase
    .from("budgets")
    .select('id, name, "periodStart", "periodEnd", "projectId"')
    .eq("id", budgetId)
    .eq("accountId", accountId)
    .single();
  if (budgetError) throw budgetError;

  const { data: lines, error: linesError } = await supabase
    .from("budget_lines")
    .select('id, "conceptId", amount, concepts(name, isExpense, isIncome)')
    .eq("budgetId", budgetId);
  if (linesError) throw linesError;

  const conceptIds = [...new Set((lines ?? []).map((line) => line.conceptId).filter(Boolean))];
  if (conceptIds.length === 0) return [];

  const reportDateFrom = dateFrom || budget.periodStart;
  const reportDateTo = dateTo || budget.periodEnd;

  const { data: txDetails, error: txDetailsError } = await supabase
    .from("transactionDetails")
    .select('conceptId, total, transactions!transaction_details_transactionId_fkey(accountId, date, isActive, "projectId")')
    .in("conceptId", conceptIds);
  if (txDetailsError) throw txDetailsError;

  const actualByConcept = new Map();
  (txDetails ?? []).forEach((row) => {
    const tx = row.transactions;
    if (!tx || tx.accountId !== accountId || tx.isActive !== true) return;
    if (reportDateFrom && tx.date < reportDateFrom) return;
    if (reportDateTo && tx.date > reportDateTo) return;
    if (budget.projectId && Number(tx.projectId || 0) !== Number(budget.projectId)) return;
    const key = Number(row.conceptId);
    const concept = (lines ?? []).find((line) => Number(line.conceptId) === key)?.concepts;
    const isExpenseConcept = Boolean(concept?.isExpense);
    const normalizedAmount = isExpenseConcept ? Math.abs(Number(row.total || 0)) : Number(row.total || 0);
    actualByConcept.set(key, (actualByConcept.get(key) || 0) + normalizedAmount);
  });

  return (lines ?? []).map((line) => {
    const budgeted = Number(line.amount || 0);
    const executed = Number(actualByConcept.get(Number(line.conceptId)) || 0);
    return {
      id: line.id,
      conceptId: line.conceptId,
      conceptName: line.concepts?.name || `#${line.conceptId}`,
      budgeted,
      executed,
      variance: budgeted - executed
    };
  });
}

export async function getProjectExecutionReport({ accountId, projectId, dateFrom, dateTo }) {
  const { data: budgets, error: budgetsError } = await supabase
    .from("budgets")
    .select('id, "periodStart", "periodEnd"')
    .eq("accountId", accountId)
    .eq("projectId", projectId)
    .eq("isActive", true);
  if (budgetsError) throw budgetsError;

  const budgetIds = (budgets ?? []).map((row) => row.id);
  const { data: budgetLines, error: budgetLinesError } = budgetIds.length
    ? await supabase.from("budget_lines").select('id, "budgetId", "conceptId", amount, concepts(name, isExpense, isIncome)').in("budgetId", budgetIds)
    : { data: [], error: null };
  if (budgetLinesError) throw budgetLinesError;

  const { data: txDetails, error: txDetailsError } = await supabase
    .from("transactionDetails")
    .select('conceptId, total, transactions!transaction_details_transactionId_fkey(accountId, date, isActive, "projectId")');
  if (txDetailsError) throw txDetailsError;

  const budgetByConcept = new Map();
  (budgetLines ?? []).forEach((line) => {
    const key = Number(line.conceptId);
    budgetByConcept.set(key, (budgetByConcept.get(key) || 0) + Number(line.amount || 0));
  });

  const executedByConcept = new Map();
  (txDetails ?? []).forEach((row) => {
    const tx = row.transactions;
    if (!tx || tx.accountId !== accountId || tx.isActive !== true) return;
    if (Number(tx.projectId || 0) !== Number(projectId)) return;
    if (dateFrom && tx.date < dateFrom) return;
    if (dateTo && tx.date > dateTo) return;
    const key = Number(row.conceptId);
    const concept = (budgetLines ?? []).find((line) => Number(line.conceptId) === key)?.concepts;
    const isExpenseConcept = Boolean(concept?.isExpense);
    const normalizedAmount = isExpenseConcept ? Math.abs(Number(row.total || 0)) : Number(row.total || 0);
    executedByConcept.set(key, (executedByConcept.get(key) || 0) + normalizedAmount);
  });

  const allConceptIds = [...new Set([...budgetByConcept.keys(), ...executedByConcept.keys()])];

  const conceptNameMap = new Map((budgetLines ?? []).map((line) => [Number(line.conceptId), line.concepts?.name || `#${line.conceptId}`]));

  return allConceptIds.map((conceptId) => {
    const budgeted = Number(budgetByConcept.get(conceptId) || 0);
    const executed = Number(executedByConcept.get(conceptId) || 0);
    return {
      id: conceptId,
      conceptId,
      conceptName: conceptNameMap.get(conceptId) || `#${conceptId}`,
      budgeted,
      executed,
      variance: budgeted - executed
    };
  });
}
