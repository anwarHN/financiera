import { fetchAllPages } from "./fetchAllPages.js";

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function summarizeBudgetExecution(rows) {
  const totals = { income: { budgeted: 0, executed: 0, variance: 0 }, expense: { budgeted: 0, executed: 0, variance: 0 } };
  for (const row of rows) {
    totals[row.lineType].budgeted += row.budgeted;
    totals[row.lineType].executed += row.executed;
  }
  for (const type of ["income", "expense"]) {
    const row = totals[type];
    row.budgeted = money(row.budgeted);
    row.executed = money(row.executed);
    row.variance = money((row.executed - row.budgeted) * (type === "income" ? 1 : -1));
  }
  const budgeted = money(totals.income.budgeted - totals.expense.budgeted);
  const executed = money(totals.income.executed - totals.expense.executed);
  return { ...totals, budgeted, executed, variance: money(executed - budgeted) };
}

/**
 * @param {any} client
 * @param {{accountId: number, budgetId?: number|null, projectId?: number|null, currencyId?: number|string|null, dateFrom?: string|null, dateTo?: string|null, statementOnly?: boolean}} filters
 */
export async function loadBudgetExecution(client, { accountId, budgetId = null, projectId = null, currencyId = null, dateFrom = null, dateTo = null, statementOnly = false }) {
  if (!accountId || (!budgetId && !projectId)) throw new Error("Budget or project is required");
  let budgets = [];
  if (!statementOnly) {
    let budgetsQuery = client.from("budgets")
      .select('id, "currencyId", "projectId", "periodStart", "periodEnd"')
      .eq("accountId", accountId).order("id");
    if (budgetId) budgetsQuery = budgetsQuery.eq("id", budgetId);
    else budgetsQuery = budgetsQuery.eq("projectId", projectId).eq("isActive", true);
    budgets = await fetchAllPages((from, to) => budgetsQuery.range(from, to));
  }
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
      .select('id, "conceptId", "lineType", amount, concepts(name, isExpense)')
      .in("budgetId", ids).order("id").range(from, to)));
  }
  const amounts = new Map();
  for (const line of lines) {
    const key = `${line.lineType}:${line.conceptId}`;
    const row = amounts.get(key) || { id: key, conceptId: Number(line.conceptId), lineType: line.lineType,
      conceptName: line.concepts?.name || `#${line.conceptId}`, budgeted: 0, executed: 0, unbudgeted: false, unclassified: false };
    row.budgeted += Number(line.amount || 0);
    amounts.set(key, row);
  }
  // Read unbudgeted movements too: excluding them would overstate the result.
  {
    let query = client.from("transactionDetails")
      .select('id, conceptId, total, net, tax, discount, additionalCharges, incomeAllocation, budgetIncomeReversal,' + (statementOnly ? ' returnTaxReversal,' : '') + ' concepts(name, isExpense, isIncome, isProduct, isSystem), transactions!transaction_details_transactionId_fkey!inner(accountId, date, type, tags, isActive, projectId, currencyId, isInternalTransfer, isDeposit, isEmployeeLoan, isInternalObligation)')
      .eq("transactions.accountId", accountId).eq("transactions.isActive", true)
      .eq("transactions.currencyId", currencyId).order("id");
    if (projectId) query = query.eq("transactions.projectId", projectId);
    if (dateFrom) query = query.gte("transactions.date", dateFrom);
    if (dateTo) query = query.lte("transactions.date", dateTo);
    const details = await fetchAllPages((from, to) => query.range(from, to));
    for (const detail of details) {
      const tx = detail.transactions;
      const tags = tx.tags || [];
      if (tx.isInternalTransfer || tx.isDeposit || tx.isEmployeeLoan || tx.isInternalObligation
        || tags.some((tag) => ["__prior_balance__", "__manual_receivable__", "__manual_payable__", "__payable_cash_in__"].includes(tag))) continue;
      const isReturn = tags.includes("__sale_return__");
      if (tags.includes("__inventory_adjustment__") && !isReturn) continue;
      let lineType, conceptId = Number(detail.conceptId), conceptName = detail.concepts?.name || `#${conceptId}`;
      let amount, unclassified = false;
      if (Number(tx.type) === 1 || isReturn) {
        lineType = "income";
        const allocation = detail.incomeAllocation;
        unclassified = !allocation?.conceptId;
        if (!unclassified) {
          conceptId = Number(allocation.conceptId);
          conceptName = allocation.name || `#${conceptId}`;
        }
        // Legacy inventory-only returns have no financial amount; do not invent one.
        amount = isReturn ? -Number(detail.budgetIncomeReversal || 0)
          : Number(detail.net || 0) - Number(detail.discount || 0) + Number(detail.additionalCharges || 0);
      } else if (Number(tx.type) === 3 && detail.concepts?.isIncome && !detail.concepts?.isSystem) {
        lineType = "income";
        amount = Number(detail.net ?? detail.total ?? 0) - Number(detail.discount || 0) + Number(detail.additionalCharges || 0);
      } else if ([2, 4].includes(Number(tx.type)) && detail.concepts?.isExpense && !detail.concepts?.isSystem && !detail.concepts?.isProduct) {
        lineType = "expense";
        amount = Math.abs(Number(detail.total || 0));
      } else continue;
      const key = `${lineType}:${unclassified ? "unclassified:" : ""}${conceptId}`;
      const row = amounts.get(key) || { id: key, conceptId, lineType, conceptName, budgeted: 0, executed: 0, unbudgeted: true, unclassified };
      row.executed += money(amount);
      if (statementOnly) {
        const tax = isReturn ? -Number(detail.returnTaxReversal || 0) : Math.abs(Number(detail.tax || 0));
        const base = lineType === "expense" ? amount - tax : amount;
        row.base = money((row.base || 0) + base);
        row.tax = money((row.tax || 0) + tax);
        row.total = money(row.base + row.tax);
        if (isReturn && detail.returnTaxReversal == null) row.unvaluedReturn = true;
      }
      if (isReturn && detail.budgetIncomeReversal == null) row.unvaluedReturn = true;
      amounts.set(key, row);
    }
  }
  return [...amounts.values()].map((row) => ({ ...row, budgeted: money(row.budgeted), executed: money(row.executed),
    variance: money((row.executed - row.budgeted) * (row.lineType === "income" ? 1 : -1))
  })).sort((a, b) => b.lineType.localeCompare(a.lineType) || Number(a.unbudgeted) - Number(b.unbudgeted) || a.conceptName.localeCompare(b.conceptName));
}

export function loadProjectIncomeStatement(client, filters) {
  if (!filters.projectId) throw new Error("Project is required");
  return loadBudgetExecution(client, { ...filters, budgetId: null, statementOnly: true });
}

export function summarizeIncomeStatement(rows) {
  const income = { base: 0, tax: 0, total: 0 };
  const expense = { base: 0, tax: 0, total: 0 };
  for (const row of rows) {
    const target = row.lineType === "income" ? income : expense;
    for (const field of ["base", "tax", "total"]) target[field] = money(target[field] + Number(row[field] || 0));
  }
  return { income, expense, result: money(income.base - expense.base) };
}
