import { fetchAllPages } from "./fetchAllPages.js";

/**
 * @param {any} client
 * @param {{accountId: number, budgetId?: number|null, projectId?: number|null, currencyId?: number|string|null, dateFrom?: string|null, dateTo?: string|null}} filters
 */
export async function loadBudgetExecution(client, { accountId, budgetId = null, projectId = null, currencyId = null, dateFrom = null, dateTo = null }) {
  if (!accountId || (!budgetId && !projectId)) throw new Error("Budget or project is required");
  let budgetsQuery = client.from("budgets")
    .select('id, "currencyId", "projectId", "periodStart", "periodEnd"')
    .eq("accountId", accountId).order("id");
  if (budgetId) budgetsQuery = budgetsQuery.eq("id", budgetId);
  else budgetsQuery = budgetsQuery.eq("projectId", projectId).eq("isActive", true);
  let budgets = await fetchAllPages((from, to) => budgetsQuery.range(from, to));
  if (budgetId) {
    if (!budgets.length) throw new Error("Budget not found for this account");
    const budget = budgets[0];
    if (!budget.currencyId) throw new Error("Configure the budget currency before running this report");
    if (currencyId && Number(currencyId) !== Number(budget.currencyId)) throw new Error("Currency does not match the budget");
    currencyId = budget.currencyId;
    projectId = budget.projectId;
    dateFrom = dateFrom || budget.periodStart;
    dateTo = dateTo || budget.periodEnd;
  } else {
    if (!currencyId) throw new Error("Select a currency for project execution");
    const { error } = await client.from("projects").select("id").eq("accountId", accountId).eq("id", projectId).single();
    if (error) throw error;
    if (budgets.some((budget) => !budget.currencyId)) throw new Error("Configure the currency of existing project budgets");
    budgets = budgets.filter((budget) => Number(budget.currencyId) === Number(currencyId));
  }
  const lines = [];
  // Bound IN lists as well as paginating their results.
  for (let index = 0; index < budgets.length; index += 100) {
    const ids = budgets.slice(index, index + 100).map((budget) => budget.id);
    lines.push(...await fetchAllPages((from, to) => client.from("budget_lines")
      .select('id, "conceptId", amount, concepts(name, isExpense)')
      .in("budgetId", ids).order("id").range(from, to)));
  }
  const amounts = new Map();
  for (const line of lines) {
    const key = Number(line.conceptId);
    const row = amounts.get(key) || { id: key, conceptId: key, conceptName: line.concepts?.name || `#${key}`, budgeted: 0, executed: 0 };
    row.budgeted += Number(line.amount || 0);
    amounts.set(key, row);
  }
  const conceptIds = [...amounts.keys()];
  const chunks = budgetId ? Array.from({ length: Math.ceil(conceptIds.length / 100) }, (_, i) => conceptIds.slice(i * 100, i * 100 + 100)) : [null];
  for (const chunk of chunks) {
    let query = client.from("transactionDetails")
      .select('id, conceptId, total, concepts(name, isExpense), transactions!transaction_details_transactionId_fkey!inner(accountId, date, isActive, projectId, currencyId)')
      .eq("transactions.accountId", accountId).eq("transactions.isActive", true)
      .eq("transactions.currencyId", currencyId).order("id");
    if (projectId) query = query.eq("transactions.projectId", projectId);
    if (dateFrom) query = query.gte("transactions.date", dateFrom);
    if (dateTo) query = query.lte("transactions.date", dateTo);
    if (chunk) query = query.in("conceptId", chunk);
    const details = await fetchAllPages((from, to) => query.range(from, to));
    for (const detail of details) {
      const key = Number(detail.conceptId);
      const row = amounts.get(key) || { id: key, conceptId: key, conceptName: detail.concepts?.name || `#${key}`, budgeted: 0, executed: 0 };
      const total = Number(detail.total || 0);
      row.executed += detail.concepts?.isExpense ? Math.abs(total) : total;
      amounts.set(key, row);
    }
  }
  return [...amounts.values()].map((row) => ({ ...row, variance: row.budgeted - row.executed }));
}
