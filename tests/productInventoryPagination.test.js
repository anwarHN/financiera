import test from "node:test";
import assert from "node:assert/strict";
import { loadProductInventoryRows } from "../supabase/functions/_shared/productInventoryRows.js";

function clientFor(tables, cap = 250) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const query = {
        select() { return query; },
        eq(field, expected) { rows = rows.filter((row) => String(row[field]) === String(expected)); return query; },
        in(field, values) {
          assert.ok(values.length <= 500, `oversized ${field} filter`);
          rows = rows.filter((row) => values.map(Number).includes(Number(row[field])));
          return query;
        },
        order(field, { ascending = true } = {}) {
          rows.sort((a, b) => (Number(a[field]) - Number(b[field])) * (ascending ? 1 : -1));
          return query;
        },
        range(from, to) {
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
        }
      };
      return query;
    }
  };
}

test("product inventory loader reads every page and stays scoped to the account", async () => {
  const details = Array.from({ length: 1005 }, (_, index) => ({
    id: index + 1,
    transactionId: index + 1,
    conceptId: 201,
    quantity: 1
  }));
  const historyRows = Array.from({ length: 1003 }, (_, index) => ({
    id: index + 1,
    transactionId: index + 2001,
    transactionDetailId: index + 1,
    accountId: 8,
    conceptId: 201,
    quantity: 1
  }));
  historyRows.push({ id: 5000, transactionId: 5000, accountId: 9, conceptId: 201, quantity: 999 });
  const transactions = [
    ...details.map((row) => ({ id: row.transactionId, accountId: 8, isActive: true, type: 4 })),
    ...historyRows.map((row) => ({ id: row.transactionId, accountId: row.accountId, isActive: true, type: 1 })),
    { id: 6000, accountId: 8, isActive: false, type: 4 }
  ];

  const loaded = await loadProductInventoryRows(clientFor({
    transactionDetails: [...details, { id: 6000, transactionId: 6000, conceptId: 202, quantity: 999 }],
    inventory_delivery_history: historyRows,
    transactions
  }), { accountId: 8, productIds: [201] });

  assert.equal(loaded.details.length, 1005);
  assert.equal(loaded.historyRows.length, 1003);
  assert.equal(loaded.transactions.length, 2008);
  assert.equal(loaded.details.at(-1).id, 1005);
  assert.equal(loaded.historyRows.at(-1).id, 1003);
  assert.ok(loaded.transactions.every((row) => row.accountId === 8 && row.isActive));
});
