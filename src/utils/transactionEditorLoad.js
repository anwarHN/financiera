// Resolve everything before exposing the editor; never turn failed catalogs into empty lists.
export async function loadTransactionEditor({ accountId, loadCatalogs, loadRecord, completeOptions }) {
  const [catalogs, record] = await Promise.all([loadCatalogs(), loadRecord()]);
  if (record && String(record.tx.accountId) !== String(accountId)) throw new Error("Transaction account mismatch");
  return { catalogs: record ? await completeOptions(catalogs, record) : catalogs, record };
}

export async function restoreSelectedOptions(client, accountId, catalogs, { tx, details }) {
  const specs = [
    ["persons", "persons", [tx.personId]],
    ["concepts", "concepts", details.map((row) => row.conceptId)],
    ["employees", "employes", [tx.employeeId, ...details.map((row) => row.sellerId)]],
    ["currencies", "currencies", [tx.currencyId]],
    ["paymentMethods", "payment_methods", [tx.paymentMethodId]],
    ["accountPaymentForms", "account_payment_forms", [tx.accountPaymentFormId]],
    ["projects", "projects", [tx.projectId]],
    ["budgets", "budgets", [tx.budgetId]]
  ];
  const result = { ...catalogs };
  for (const [key, table, ids] of specs) {
    const rows = catalogs[key].map((row) => ({ ...row, id: Number(row.id) }));
    const missing = [...new Set(ids.filter(Boolean).map(Number))].filter((id) => !rows.some((row) => row.id === id));
    for (const id of missing) {
      let query = client.from(table).select("*").eq("id", id);
      query = table === "currencies" ? query.or(`accountId.eq.${accountId},accountId.is.null`) : query.eq("accountId", accountId);
      const { data, error } = await query.single();
      if (error) throw error;
      if (!data) throw new Error(`Selected ${key} not found`);
      rows.push({ ...data, id: Number(data.id) });
    }
    result[key] = rows;
  }
  return result;
}
