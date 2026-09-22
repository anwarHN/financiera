import test from "node:test";
import assert from "node:assert/strict";
import { loadBudgetExecution } from "../supabase/functions/_shared/budgetExecution.js";
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
  const tx = { accountId: 8, projectId: 7, currencyId: 1, isActive: true, date: "2026-09-18" };
  const details = Array.from({ length: 1205 }, (_, id) => ({ id, conceptId: 10, total: -2, concepts: expense, transactions: tx }));
  details.push(
    { id: 2000, conceptId: 20, total: -50, concepts: { name: "Unbudgeted", isExpense: true }, transactions: tx },
    ...[{ accountId: 9 }, { projectId: 9 }, { currencyId: 2 }, { isActive: false }, { date: "2027-01-01" }]
      .map((override, index) => ({ id: 3000 + index, conceptId: 10, total: -999, concepts: expense, transactions: { ...tx, ...override } }))
  );
  return {
    budgets: [{ id: 1, accountId: 8, projectId: 7, currencyId: 1, isActive: true, periodStart: "2026-09-01", periodEnd: "2026-11-16" },
      { id: 2, accountId: 8, projectId: 7, currencyId: 2, isActive: true }],
    budget_lines: [{ id: 1, budgetId: 1, conceptId: 10, amount: 3000, concepts: expense },
      { id: 2, budgetId: 2, conceptId: 10, amount: 99999, concepts: expense }],
    projects: [{ id: 7, accountId: 8 }],
    transactionDetails: details
  };
}

test("budget reads all details even with a smaller server cap and excludes other currencies/accounts/dates", async () => {
  const rows = await loadBudgetExecution(clientFor(fixture(), 400), { accountId: 8, budgetId: 1 });
  assert.deepEqual(rows, [{ id: 10, conceptId: 10, conceptName: "Venue", budgeted: 3000, executed: 2410, variance: 590 }]);
});

test("project preserves unbudgeted expenses and selects only budgets in the selected currency", async () => {
  const rows = await loadBudgetExecution(clientFor(fixture()), { accountId: 8, projectId: 7, currencyId: 1, dateFrom: "2026-09-01", dateTo: "2026-11-16" });
  assert.equal(rows.reduce((sum, row) => sum + row.executed, 0), 2460);
  assert.deepEqual(rows.find((row) => row.conceptId === 20), { id: 20, conceptId: 20, conceptName: "Unbudgeted", budgeted: 0, executed: 50, variance: -50 });
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
    id: budget.id, budgetId: budget.id, conceptId: 10, amount: 3, concepts: { name: "Venue", isExpense: true }
  }));
  tables.transactionDetails = [];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, projectId: 7, currencyId: 1 });
  assert.equal(rows[0].budgeted, 3303);
  assert.equal(rows[0].executed, 0);
});

test("budget reads more than 1000 lines and rejects legacy budgets without currency", async () => {
  const tables = fixture();
  tables.budget_lines = Array.from({ length: 1101 }, (_, id) => ({
    id, budgetId: 1, conceptId: id + 1, amount: 3, concepts: { name: String(id), isExpense: true }
  }));
  tables.transactionDetails = [];
  const rows = await loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 });
  assert.equal(rows.length, 1101);
  assert.equal(rows.reduce((sum, row) => sum + row.budgeted, 0), 3303);
  tables.budgets[0].currencyId = null;
  await assert.rejects(loadBudgetExecution(clientFor(tables), { accountId: 8, budgetId: 1 }), /currency/);
});
