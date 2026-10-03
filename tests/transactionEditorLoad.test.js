import test from "node:test";
import assert from "node:assert/strict";
import { loadTransactionEditor, restoreSelectedOptions } from "../src/utils/transactionEditorLoad.js";

const emptyCatalogs = () => ({ persons: [], concepts: [], employees: [], currencies: [], paymentMethods: [], accountPaymentForms: [], projects: [], budgets: [], tags: [] });

test("editor waits for both catalogs and record in either completion order", async () => {
  for (const first of ["catalogs", "record"]) {
    let resolveCatalogs, resolveRecord, completed = false;
    const catalogs = new Promise((resolve) => { resolveCatalogs = resolve; });
    const record = new Promise((resolve) => { resolveRecord = resolve; });
    const loading = loadTransactionEditor({ accountId: 8, loadCatalogs: () => catalogs, loadRecord: () => record,
      completeOptions: (value) => value }).then((value) => { completed = true; return value; });
    const tx = { tx: { accountId: 8, isAccountReceivable: true }, details: [{ sellerId: 15 }] };
    if (first === "catalogs") resolveCatalogs(emptyCatalogs()); else resolveRecord(tx);
    await Promise.resolve();
    assert.equal(completed, false);
    if (first === "catalogs") resolveRecord(tx); else resolveCatalogs(emptyCatalogs());
    assert.equal((await loading).record, tx);
  }
});

test("failed catalogs and foreign account documents cannot open an editable form", async () => {
  const options = { accountId: 8, loadCatalogs: async () => emptyCatalogs(),
    loadRecord: async () => ({ tx: { accountId: 8 }, details: [] }), completeOptions: (value) => value };
  await assert.rejects(loadTransactionEditor({ ...options, loadCatalogs: async () => { throw new Error("offline"); } }), /offline/);
  await assert.rejects(loadTransactionEditor({ ...options, loadRecord: async () => ({ tx: { accountId: 9 } }) }), /mismatch/);
  assert.equal((await loadTransactionEditor({ ...options, loadRecord: async () => null })).record, null);
});

test("restore only selected inactive records, scoped to account, and normalize IDs", async () => {
  const calls = [];
  const client = { from(table) {
    const filters = {};
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      or(value) { filters.or = value; return query; },
      async single() {
        calls.push({ table, filters });
        return { data: { id: String(filters.id), name: "Assigned inactive", isActive: false, kind: "bank_account", code: "bank_transfer" } };
      }
    };
    return query;
  } };
  const catalogs = emptyCatalogs();
  catalogs.concepts = [{ id: "3", name: "Concept" }];
  const data = await restoreSelectedOptions(client, 8, catalogs, {
    tx: { employeeId: 4, accountPaymentFormId: 5, paymentMethodId: 6, currencyId: 7, budgetId: 8 },
    details: [{ conceptId: 3, sellerId: 4 }, { conceptId: 3, sellerId: 4 }]
  });
  assert.equal(data.concepts[0].id, 3);
  assert.equal(data.employees.length, 1);
  assert.equal(data.employees[0].id, 4);
  assert.equal(data.accountPaymentForms[0].kind, "bank_account");
  assert.equal(data.paymentMethods[0].code, "bank_transfer");
  assert.equal(data.budgets[0].id, 8);
  assert.equal(calls.length, 5);
  for (const { table, filters } of calls) {
    if (table === "currencies") assert.equal(filters.or, "accountId.eq.8,accountId.is.null");
    else assert.equal(filters.accountId, 8);
  }
});

test("unavailable selected options fail instead of silently clearing the selection", async () => {
  const client = { from() {
    const query = { select: () => query, eq: () => query, single: async () => ({ error: new Error("not accessible") }) };
    return query;
  } };
  await assert.rejects(restoreSelectedOptions(client, 8, emptyCatalogs(), { tx: { personId: 1 }, details: [] }), /not accessible/);
});
