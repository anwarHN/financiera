import test from "node:test";
import assert from "node:assert/strict";
import { loadBudgetExecution, summarizeBudgetExecution, loadProjectIncomeStatement, summarizeIncomeStatement } from "../supabase/functions/_shared/budgetExecution.js";
import { fetchAllPages } from "../supabase/functions/_shared/fetchAllPages.js";

function clientFor(tables, cap = 1000) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const value = (row, field) => field.split(".").reduce((entry, key) => entry?.[key], row);
      const query = {
        select() { return query; },
        eq(field, expected) { rows = rows.filter((row) => String(value(row, field)) === String(expected)); return query; },
        in(field, values) { rows = rows.filter((row) => values.includes(value(row, field))); return query; },
        gte(field, expected) { rows = rows.filter((row) => value(row, field) >= expected); return query; },
        lte(field, expected) { rows = rows.filter((row) => value(row, field) <= expected); return query; },
        order(field) { rows.sort((a, b) => value(a, field) - value(b, field)); return query; },
        single() { return Promise.resolve(rows.length === 1 ? { data: rows[0], error: null } : { error: new Error("Not found") }); },
        range(from, to) { return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null }); }
      };
      return query;
    }
  };
}

function fixture() {
  const expense = { name: "Venue", isExpense: true };
  const tx = { accountId: 8, projectId: 7, currencyId: 1, type: 2, isActive: true, date: "2026-09-18" };
  const details = Array.from({ length: 1205 }, (_, id) => ({ id, conceptId: 10, total: -2, concepts: expense, transactions: tx }));
  details.push(
    { id: 2000, conceptId: 20, total: -50, concepts: { name: "Unbudgeted", isExpense: true }, transactions: tx },
    ...[{ accountId: 9 }, { projectId: 9 }, { currencyId: 2 }, { isActive: false }, { date: "2027-01-01" }]
      .map((override, index) => ({ id: 3000 + index, conceptId: 10, total: -999, concepts: expense, transactions: { ...tx, ...override } }))
  );
  return {
    budgets: [{ id: 1, accountId: 8, projectId: 7, currencyId: 1, isActive: true, periodStart: "2026-09-01", periodEnd: "2026-11-16" },
      { id: 2, accountId: 8, projectId: 7, currencyId: 2, isActive: true }],
    budget_lines: [{ id: 1, budgetId: 1, conceptId: 10, lineType: "expense", amount: 3000, concepts: expense },
      { id: 2, budgetId: 2, conceptId: 10, lineType: "expense", amount: 99999, concepts: expense }],
    projects: [{ id: 7, accountId: 8 }],
    transactionDetails: details
  };
}

test("project statement needs no budget and separates expense tax without changing budget execution", async () => {
  const tables = fixture();
  const tx = tables.transactionDetails[0].transactions;
  // Even an unrelated legacy budget without currency must not block the statement.
  tables.budgets[0].currencyId = null;
  const sale = { id: 1, conceptId: 90, net: 1000, discount: 100, additionalCharges: 10, tax: 150, total: 1060,
    incomeAllocation: { conceptId: 60, name: "Services" }, transactions: { ...tx, type: 1 } };
  tables.transactionDetails = [sale,
    { id: 2, conceptId: 10, net: -600, tax: -90, total: -710, additionalCharges: -20, concepts: { isExpense: true, name: "Venue" }, transactions: tx },
    { ...sale, id: 3, total: 0, budgetIncomeReversal: 91, returnTaxReversal: 15, transactions: { ...tx, type: 2, tags: ["__sale_return__"] } },
    { ...sale, id: 4, transactions: { ...tx, type: 6 } },
    { ...sale, id: 5, transactions: { ...tx, type: 1, accountId: 9 } },
    { ...sale, id: 6, transactions: { ...tx, type: 1, projectId: 9 } },
    { ...sale, id: 7, transactions: { ...tx, type: 1, currencyId: 2 } },
    { ...sale, id: 8, transactions: { ...tx, type: 1, isActive: false } }
  ];
  const filters = { accountId: 8, projectId: 7, currencyId: 1 };
  const rows = await loadProjectIncomeStatement(clientFor(tables, 1), filters);
  assert.deepEqual(summarizeIncomeStatement(rows), {
    income: { base: 819, tax: 135, total: 954 }, expense: { base: 620, tax: 90, total: 710 }, result: 199
  });
  tables.budgets[0].currencyId = 1;
  const budget = await loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 });
  assert.equal(budget.find((row) => row.lineType === "expense").executed, 710);
  await assert.rejects(loadProjectIncomeStatement(clientFor(tables), { accountId: 9, projectId: 7, currencyId: 1 }), /Not found/);
  assert.throws(() => loadProjectIncomeStatement(clientFor(tables), { accountId: 8, currencyId: 1 }), /Project/);
});

test("statement paginates over 1000 rows and flags unvalued returns", async () => {
  const tables = fixture();
  const tx = tables.transactionDetails[0].transactions;
  tables.transactionDetails.push({ id: 9000, conceptId: 90, total: 0, budgetIncomeReversal: 5,
    transactions: { ...tx, tags: ["__sale_return__"] } });
  const rows = await loadProjectIncomeStatement(clientFor(tables, 300), {
    accountId: 8, projectId: 7, currencyId: 1, dateFrom: "2026-09-01", dateTo: "2026-11-16"
  });
  assert.equal(summarizeIncomeStatement(rows).expense.base, 2460);
  assert.equal(rows.find((row) => row.conceptId === 90).unvaluedReturn, true);
});

test("budget reads all details even with a smaller server cap and excludes other currencies/accounts/dates", async () => {
  const rows = await loadBudgetExecution(clientFor(fixture(), 400), { accountId: 8, budgetId: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.conceptId === 10).executed, 2410);
  assert.equal(rows.find((row) => row.conceptId === 20).unbudgeted, true);
});

test("project preserves unbudgeted expenses and selects only budgets in the selected currency", async () => {
  const rows = await loadBudgetExecution(clientFor(fixture()), { accountId: 8, projectId: 7, currencyId: 1, dateFrom: "2026-09-01", dateTo: "2026-11-16" });
  assert.equal(rows.reduce((sum, row) => sum + row.executed, 0), 2460);
  assert.deepEqual(rows.find((row) => row.conceptId === 20), { id: "expense:20", conceptId: 20, lineType: "expense", conceptName: "Unbudgeted", budgeted: 0, executed: 50, variance: -50, unbudgeted: true, unclassified: false });
  assert.equal(rows.reduce((sum, row) => sum + row.budgeted, 0), 3000);
});

test("rejects absent currency, mismatched budget currency and foreign account budget", async () => {
  const client = clientFor(fixture());
  await assert.rejects(loadBudgetExecution(client, { accountId: 8, projectId: 7 }), /currency/);
  await assert.rejects(loadBudgetExecution(client, { accountId: 8, budgetId: 1, currencyId: 2 }), /Currency/);
  await assert.rejects(loadBudgetExecution(client, { accountId: 9, budgetId: 1 }), /not found/);
});

test("pagination fails on later-page errors instead of returning partial totals", async () => {
  await assert.rejects(fetchAllPages(async (from) => from === 0
    ? { data: [{ id: 1 }] }
    : { error: new Error("network failure") }), /network failure/);
});

test("project reads more than 1000 budgets and lines without truncating IN lists", async () => {
  const tables = fixture();
  tables.budgets = Array.from({ length: 1101 }, (_, id) => ({
    id: id + 1, accountId: 8, projectId: 7, currencyId: 1, isActive: true
  }));
  tables.budget_lines = tables.budgets.map((budget) => ({
    id: budget.id, budgetId: budget.id, conceptId: 10, lineType: "expense", amount: 3, concepts: { name: "Venue", isExpense: true }
  }));
  tables.transactionDetails = [];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, projectId: 7, currencyId: 1 });
  assert.equal(rows[0].budgeted, 3303);
  assert.equal(rows[0].executed, 0);
});

test("budget reads more than 1000 lines and rejects legacy budgets without currency", async () => {
  const tables = fixture();
  tables.budget_lines = Array.from({ length: 1101 }, (_, id) => ({
    id, budgetId: 1, conceptId: id + 1, lineType: "expense", amount: 3, concepts: { name: String(id), isExpense: true }
  }));
  tables.transactionDetails = [];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 });
  assert.equal(rows.length, 1101);
  assert.equal(rows.reduce((sum, row) => sum + row.budgeted, 0), 3303);
  tables.budgets[0].currencyId = null;
  await assert.rejects(loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 }), /currency/);
});

test("income uses invoice snapshot, excludes taxes and payments, and includes unclassified sales and returns", async () => {
  const tables = fixture();
  const tx = tables.transactionDetails[0].transactions;
  tables.budget_lines.push({ id: 3, budgetId: 1, conceptId: 30, lineType: "income", amount: 100, concepts: { name: "Services" } });
  const sale = { id: 1, conceptId: 99, net: 200, discount: 20, additionalCharges: 5, total: 215,
    incomeAllocation: { conceptId: 30, name: "Services" }, concepts: { isProduct: true, isIncome: true, name: "Product" }, transactions: { ...tx, type: 1 } };
  tables.transactionDetails = [sale,
    { ...sale, id: 2, incomeAllocation: null, net: 50, discount: 0, additionalCharges: 0 },
    { ...sale, id: 3, transactions: { ...tx, type: 6 } },
    { ...sale, id: 4, transactions: { ...tx, type: 1, tags: ["__prior_balance__"] } },
    { ...sale, id: 5, transactions: { ...tx, type: 1, isActive: false } },
    { ...sale, id: 6, budgetIncomeReversal: 18.5, total: 0, transactions: { ...tx, type: 2, tags: ["__sale_return__", "__inventory_adjustment__"] } },
    { ...sale, id: 7, transactions: { ...tx, type: 4 } },
    { ...sale, id: 8, transactions: { ...tx, type: 3, tags: ["__payable_cash_in__"] } },
    { id: 9, conceptId: 10, total: -60, concepts: { isExpense: true, name: "Venue" }, transactions: tx }
  ];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 });
  assert.equal(rows.find((row) => row.conceptId === 30).executed, 166.5);
  assert.equal(rows.find((row) => row.conceptId === 30).variance, 66.5);
  assert.equal(rows.find((row) => row.unclassified).executed, 50);
  const totals = summarizeBudgetExecution(rows);
  assert.equal(totals.income.executed, 216.5);
  assert.equal(totals.expense.executed, 60);
  assert.equal(totals.executed, 156.5);
  assert.equal(totals.budgeted, -2900);
  assert.equal(totals.variance, 3056.5);
});

test("legacy returns are flagged and direct income is not counted again as payment", async () => {
  const tables = fixture();
  const tx = tables.transactionDetails[0].transactions;
  tables.transactionDetails = [
    { id: 1, conceptId: 50, total: 0, transactions: { ...tx, type: 2, tags: ["__sale_return__"] } },
    { id: 2, conceptId: 60, net: 100, discount: 5, additionalCharges: 10, total: 120,
      concepts: { name: "Other income", isIncome: true }, transactions: { ...tx, type: 3 } },
    { id: 3, conceptId: 60, total: 120, concepts: { name: "Payment", isIncome: true }, transactions: { ...tx, type: 6 } }
  ];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 });
  assert.equal(rows.find((row) => row.conceptId === 50).unvaluedReturn, true);
  assert.equal(summarizeBudgetExecution(rows).income.executed, 105);
});
