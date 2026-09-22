import { fetchAllPages } from "./fetchAllPages.js";

export function summarizeCredits(entries, asOf) {
  const active = entries.filter((entry) => entry.date <= asOf && (!entry.voidedOn || entry.voidedOn > asOf));
  const used = new Map();
  for (const entry of active) {
    if (entry.creditId) used.set(Number(entry.creditId), (used.get(Number(entry.creditId)) || 0) + Number(entry.amount));
  }
  return active.filter((entry) => !entry.creditId).map((entry) => ({
    ...entry, applied: used.get(Number(entry.id)) || 0,
    available: Number((Number(entry.amount) - (used.get(Number(entry.id)) || 0)).toFixed(2))
  }));
}

/** @param {any} client @param {number} accountId @param {string} asOf @param {number|string|null} [currencyId] */
export async function loadCreditEntries(client, accountId, asOf, currencyId = null) {
  let query = client.from("customer_credit_entries")
    .select('*, persons(name), currencies(name, symbol)')
    .eq("accountId", accountId).lte("date", asOf).order("id");
  if (currencyId) query = query.eq("currencyId", currencyId);
  return fetchAllPages((from, to) => query.range(from, to));
}

export function appliedCreditByInvoice(entries, asOf) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.kind !== "application" || entry.date > asOf || (entry.voidedOn && entry.voidedOn <= asOf)) continue;
    const key = Number(entry.invoiceId);
    map.set(key, (map.get(key) || 0) + Number(entry.amount));
  }
  return map;
}

export function creditReceivableRows(entries, asOf) {
  return summarizeCredits(entries, asOf).filter((credit) => credit.available > 0).map((credit) => ({
    id: `credit-${credit.id}`, personId: Number(credit.personId), persons: credit.persons,
    currencyId: credit.currencyId, date: credit.date, type: 6,
    name: `Saldo a favor: ${credit.reference}`, referenceNumber: credit.reference,
    total: 0, balance: -credit.available, customerCredit: credit.available
  }));
}
