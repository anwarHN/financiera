import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCredits, appliedCreditByInvoice, creditReceivableRows } from "../supabase/functions/_shared/customerCredits.js";

const entries = [
  { id: 1, accountId: 8, personId: 2, currencyId: 1, kind: "excess", amount: 300, date: "2026-01-01", reference: "Receipt" },
  { id: 2, creditId: 1, kind: "application", invoiceId: 10, amount: 120, date: "2026-01-03", voidedOn: "2026-01-05" },
  { id: 3, creditId: 1, kind: "refund", amount: 180, date: "2026-01-04" }
];
test("credit as of date includes only movements effective at the cutoff", () => {
  assert.equal(summarizeCredits(entries,"2026-01-02")[0].available,300);
  assert.equal(summarizeCredits(entries,"2026-01-03")[0].available,180);
  assert.equal(summarizeCredits(entries,"2026-01-04")[0].available,0);
  assert.equal(summarizeCredits(entries,"2026-01-05")[0].available,120);
});
test("invoice applications and negative receivable rows agree at cutoff", () => {
  assert.equal(appliedCreditByInvoice(entries,"2026-01-03").get(10),120);
  assert.equal(appliedCreditByInvoice(entries,"2026-01-05").size,0);
  assert.equal(creditReceivableRows(entries,"2026-01-03")[0].balance,-180);
  assert.equal(creditReceivableRows(entries,"2026-01-04").length,0);
});
