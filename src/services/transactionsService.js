import { supabase } from "../lib/supabase";

export const TRANSACTION_TYPES = {
  sale: 1,
  expense: 2,
  income: 3,
  purchase: 4,
  outgoingPayment: 5,
  incomingPayment: 6
};

export async function listTransactions({
  accountId,
  type,
  excludeInternalObligations = false,
  excludeEmployeeLoans = false
}) {
  let query = supabase
    .from("transactions")
    .select(
      'id, personId, "employeeId", date, type, status, total, balance, payments, name, tags, currencyId, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "isEmployeeLoan", "sourceTransactionId", "isInternalTransfer", "isDeposit", "isAccountReceivable", "isAccountPayable", "affectsPayroll", isActive, persons(name), employes(name), projects(name), account_payment_forms(name)'
    )
    .eq("accountId", accountId)
    .eq("type", type);

  if (excludeInternalObligations) {
    query = query.eq("isInternalObligation", false);
  }
  if (excludeEmployeeLoans) {
    query = query.eq("isEmployeeLoan", false);
  }

  const { data, error } = await query.order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listPrimaryConceptsByTransactionIds(transactionIds = []) {
  const ids = (transactionIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("transactionDetails")
    .select("id, transactionId, concepts(name)")
    .in("transactionId", ids)
    .order("id", { ascending: true });

  if (error) throw error;

  const conceptByTransactionId = {};
  for (const row of data ?? []) {
    const txId = Number(row.transactionId);
    if (!txId || conceptByTransactionId[txId]) continue;
    conceptByTransactionId[txId] = row.concepts?.name ?? null;
  }

  return conceptByTransactionId;
}

export async function listTransactionsByProject({ accountId, projectId, dateFrom, dateTo }) {
  let query = supabase
    .from("transactions")
    .select(
      'id, date, type, total, balance, name, personId, "projectId", isActive, persons(name), projects(name)'
    )
    .eq("accountId", accountId)
    .eq("projectId", projectId)
    .eq("isActive", true);

  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);

  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTransactionWithDetails({ transaction, details }) {
  const { data: createdTransaction, error: transactionError } = await supabase
    .from("transactions")
    .insert(transaction)
    .select("id")
    .single();

  if (transactionError) {
    throw transactionError;
  }

  const detailsToInsert = (details ?? []).map((detail) => ({
    ...detail,
    transactionId: createdTransaction.id
  }));

  if (detailsToInsert.length > 0) {
    const { error: detailError } = await supabase.from("transactionDetails").insert(detailsToInsert);

    if (detailError) {
      await supabase.from("transactions").delete().eq("id", createdTransaction.id);
      throw detailError;
    }
  }

  return createdTransaction;
}

export async function createTransactionWithDetail({ transaction, detail }) {
  return createTransactionWithDetails({ transaction, details: [detail] });
}

export async function updateTransaction(id, payload) {
  const { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function updateTransactionWithDetails({ transactionId, transaction, details }) {
  const { data: updatedTransaction, error: transactionError } = await supabase
    .from("transactions")
    .update(transaction)
    .eq("id", transactionId)
    .select("id")
    .single();
  if (transactionError) throw transactionError;

  const { error: deleteDetailsError } = await supabase.from("transactionDetails").delete().eq("transactionId", transactionId);
  if (deleteDetailsError) throw deleteDetailsError;

  if (Array.isArray(details) && details.length > 0) {
    const detailsToInsert = details.map((detail) => ({
      ...detail,
      transactionId
    }));
    const { error: insertDetailsError } = await supabase.from("transactionDetails").insert(detailsToInsert);
    if (insertDetailsError) throw insertDetailsError;
  }

  return updatedTransaction;
}

export async function deactivateTransaction(id) {
  const { error } = await supabase.from("transactions").update({ isActive: false }).eq("id", id);

  if (error) {
    throw error;
  }
}

export async function getTransactionById(id) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      'id, accountId, personId, "employeeId", date, type, name, tags, total, balance, payments, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "isEmployeeLoan", "sourceTransactionId", "isInternalTransfer", "isDeposit", "affectsPayroll", "deliveryAddress", isActive, currencyId, persons(name), employes(name), projects(name), account_payment_forms(name)'
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listTransactionDetails(transactionId) {
  const { data, error } = await supabase
    .from("transactionDetails")
    .select(
      "id, conceptId, quantity, quantityDelivered, pendingDelivery, price, net, taxPercentage, tax, discountPercentage, discount, total, additionalCharges, transactionPaidId, concepts(name, isProduct, productType)"
    )
    .eq("transactionId", transactionId)
    .order("id");
  if (error) throw error;
  return data ?? [];
}

export async function listPendingDeliveryInvoices(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let txQuery = supabase
    .from("transactions")
    .select('id, date, total, currencyId, personId, "referenceNumber", persons(name)')
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq("type", TRANSACTION_TYPES.sale);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: txRows, error: txError } = await txQuery.order("date", { ascending: false });
  if (txError) throw txError;

  const txIds = (txRows ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!txIds.length) return [];

  const { data: detailRows, error: detailError } = await supabase
    .from("transactionDetails")
    .select('id, transactionId, conceptId, quantity, quantityDelivered, "historicalQuantityDelivered", pendingDelivery, concepts(name)')
    .in("transactionId", txIds)
    .order("id", { ascending: true });
  if (detailError) throw detailError;

  const detailIds = (detailRows ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const deliveredHistoryByDetailId = new Map();
  if (detailIds.length > 0) {
    const { data: historyRows, error: historyError } = await supabase
      .from("inventory_delivery_history")
      .select('transactionDetailId, quantity')
      .in("transactionDetailId", detailIds);
    if (historyError) throw historyError;
    (historyRows ?? []).forEach((row) => {
      const detailId = Number(row.transactionDetailId || 0);
      if (!detailId) return;
      deliveredHistoryByDetailId.set(detailId, Number(deliveredHistoryByDetailId.get(detailId) || 0) + Math.max(Number(row.quantity || 0), 0));
    });
  }

  const byTxId = new Map();
  (detailRows ?? []).forEach((row) => {
    const txId = Number(row.transactionId);
    const quantity = Math.max(Number(row.quantity || 0), 0);
    const deliveredFromFields =
      Math.max(Number(row.historicalQuantityDelivered || 0), 0) + Math.max(Number(row.quantityDelivered || 0), 0);
    const deliveredFromHistory = deliveredHistoryByDetailId.get(Number(row.id));
    const delivered = Math.min(
      Math.max(Number.isFinite(deliveredFromHistory) ? deliveredFromHistory : deliveredFromFields, 0),
      quantity
    );
    const pending = Math.max(quantity - delivered, 0);
    if (pending <= 0) return;
    const list = byTxId.get(txId) || [];
    list.push({
      id: row.id,
      conceptId: row.conceptId,
      productName: row.concepts?.name || "-",
      quantity,
      quantityDelivered: delivered,
      pendingQuantity: pending,
      pendingDelivery: Boolean(row.pendingDelivery)
    });
    byTxId.set(txId, list);
  });

  return (txRows ?? [])
    .map((tx) => {
      const details = byTxId.get(Number(tx.id)) || [];
      const pendingTotal = details.reduce((acc, row) => acc + Number(row.pendingQuantity || 0), 0);
      return {
        ...tx,
        details,
        pendingTotal
      };
    })
    .filter((row) => row.details.length > 0)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}

export async function listReturnableSaleDetails(transactionId) {
  const txId = Number(transactionId);
  if (!Number.isFinite(txId) || txId <= 0) throw new Error("Invalid sale id");

  const sale = await getTransactionById(txId);
  if (!sale || Number(sale.type) !== TRANSACTION_TYPES.sale) {
    throw new Error("Sale transaction not found");
  }

  const saleDetails = await listTransactionDetails(txId);
  const sourceDetailIds = saleDetails.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!sourceDetailIds.length) return [];

  const { data: returnDetailRows, error: returnDetailError } = await supabase
    .from("transactionDetails")
    .select("transactionPaidId, quantity, transactions!transaction_details_transactionId_fkey(id, sourceTransactionId, tags, isActive)")
    .in("transactionPaidId", sourceDetailIds);
  if (returnDetailError) throw returnDetailError;

  const returnedByDetailId = new Map();
  (returnDetailRows ?? []).forEach((row) => {
    const parent = row.transactions;
    const tags = Array.isArray(parent?.tags) ? parent.tags : [];
    const isReturn = Number(parent?.sourceTransactionId || 0) === txId && tags.includes("__sale_return__") && Boolean(parent?.isActive);
    if (!isReturn) return;
    const sourceDetailId = Number(row.transactionPaidId || 0);
    if (!sourceDetailId) return;
    const qty = Math.max(Number(row.quantity || 0), 0);
    returnedByDetailId.set(sourceDetailId, Number(returnedByDetailId.get(sourceDetailId) || 0) + qty);
  });

  return saleDetails
    .filter((row) => Boolean(row.concepts?.isProduct))
    .map((row) => {
      const qty = Math.max(Number(row.quantity || 0), 0);
      const returned = Math.max(Number(returnedByDetailId.get(Number(row.id)) || 0), 0);
      const maxReturnable = Math.max(qty - returned, 0);
      return {
        id: Number(row.id),
        conceptId: Number(row.conceptId),
        conceptName: row.concepts?.name || "-",
        quantity: qty,
        alreadyReturnedQuantity: returned,
        maxReturnableQuantity: maxReturnable,
        price: Number(row.price || 0),
        taxPercentage: Number(row.taxPercentage || 0),
        discountPercentage: Number(row.discountPercentage || 0),
        additionalCharges: Number(row.additionalCharges || 0)
      };
    });
}

export async function createSaleReturnTransaction({
  saleTransactionId,
  returnDate,
  referenceNumber,
  description,
  lines,
  userId
}) {
  const txId = Number(saleTransactionId);
  if (!Number.isFinite(txId) || txId <= 0) throw new Error("Invalid sale id");
  const returnLines = (lines || [])
    .map((line) => ({
      sourceDetailId: Number(line.sourceDetailId),
      conceptId: Number(line.conceptId),
      quantity: Math.max(Number(line.quantity || 0), 0)
    }))
    .filter((line) => Number.isFinite(line.sourceDetailId) && line.sourceDetailId > 0 && Number.isFinite(line.conceptId) && line.conceptId > 0 && line.quantity > 0);
  if (!returnLines.length) throw new Error("No return lines");

  const saleTx = await getTransactionById(txId);
  if (!saleTx || Number(saleTx.type) !== TRANSACTION_TYPES.sale) throw new Error("Sale transaction not found");

  const returnable = await listReturnableSaleDetails(txId);
  const byDetailId = new Map(returnable.map((row) => [Number(row.id), row]));
  for (const line of returnLines) {
    const source = byDetailId.get(line.sourceDetailId);
    if (!source) throw new Error("Invalid source detail");
    if (line.quantity > Number(source.maxReturnableQuantity || 0)) {
      throw new Error("Return quantity exceeds pending returnable quantity.");
    }
  }

  const transactionPayload = {
    accountId: saleTx.accountId,
    personId: saleTx.personId || null,
    employeeId: null,
    date: returnDate,
    type: TRANSACTION_TYPES.expense,
    name: description?.trim() || `Devolución factura #${saleTx.id}`,
    referenceNumber: referenceNumber?.trim() || saleTx.referenceNumber || null,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: userId,
    net: 0,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: 0,
    isAccountPayable: false,
    isAccountReceivable: false,
    isIncomingPayment: false,
    isOutcomingPayment: false,
    balance: 0,
    payments: 0,
    isActive: true,
    currencyId: saleTx.currencyId || null,
    paymentMethodId: null,
    accountPaymentFormId: null,
    isReconciled: false,
    reconciledAt: null,
    projectId: saleTx.projectId || null,
    tags: ["__inventory_adjustment__", "__sale_return__"],
    sourceTransactionId: txId,
    isInternalTransfer: false,
    isDeposit: false
  };

  const detailsPayload = returnLines.map((line) => ({
    conceptId: line.conceptId,
    quantity: line.quantity,
    quantityDelivered: 0,
    pendingDelivery: false,
    price: 0,
    net: 0,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: 0,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: line.sourceDetailId
  }));

  return createTransactionWithDetails({
    transaction: transactionPayload,
    details: detailsPayload
  });
}

export async function registerInventoryDelivery({ transactionId, deliveryDate, deliveries = [] }) {
  const txId = Number(transactionId);
  if (!Number.isFinite(txId) || txId <= 0) throw new Error("Invalid transaction id");
  const normalizedDeliveryDate =
    typeof deliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
      ? deliveryDate
      : new Date().toISOString().slice(0, 10);
  const toDeliverRows = (deliveries || [])
    .map((row) => ({
      detailId: Number(row.detailId),
      quantityToDeliver: Number(row.quantityToDeliver || 0)
    }))
    .filter((row) => Number.isFinite(row.detailId) && row.detailId > 0 && Number.isFinite(row.quantityToDeliver) && row.quantityToDeliver > 0);

  if (!toDeliverRows.length) return;

  const detailIds = toDeliverRows.map((row) => row.detailId);
  const { data: currentDetails, error: currentError } = await supabase
    .from("transactionDetails")
    .select('id, transactionId, conceptId, quantity, quantityDelivered, transactions!transaction_details_transactionId_fkey(accountId)')
    .in("id", detailIds)
    .eq("transactionId", txId);
  if (currentError) throw currentError;
  if (!currentDetails?.length) {
    throw new Error("No se encontraron líneas válidas para registrar la entrega.");
  }

  const currentById = new Map((currentDetails ?? []).map((row) => [Number(row.id), row]));
  const updates = [];
  const historyRows = [];
  const deliveryBatchKey = `delivery-${txId}-${Date.now()}`;

  for (const row of toDeliverRows) {
    const current = currentById.get(row.detailId);
    if (!current) continue;
    const qty = Math.max(Number(current.quantity || 0), 0);
    const delivered = Math.max(Number(current.quantityDelivered || 0), 0);
    const pending = Math.max(qty - delivered, 0);
    if (pending <= 0) continue;
    const deliveredNow = Math.min(pending, row.quantityToDeliver);
    const nextDelivered = Math.min(qty, delivered + deliveredNow);
    updates.push({ id: row.detailId, quantityDelivered: nextDelivered });
    historyRows.push({
      accountId: Number(current.transactions?.accountId || 0),
      transactionId: txId,
      transactionDetailId: row.detailId,
      conceptId: current.conceptId ? Number(current.conceptId) : null,
      deliveryBatchKey,
      deliveryDate: normalizedDeliveryDate,
      quantity: deliveredNow
    });
  }

  if (!updates.length || !historyRows.length) {
    throw new Error("No hay cantidades pendientes válidas para registrar.");
  }

  const updateResults = await Promise.all(
    updates.map((row) =>
      supabase.from("transactionDetails").update({ quantityDelivered: row.quantityDelivered }).eq("id", row.id)
    )
  );
  const failed = updateResults.find((result) => result.error);
  if (failed?.error) throw failed.error;

  if (historyRows.length > 0) {
    const { error: historyError } = await supabase.from("inventory_delivery_history").insert(historyRows);
    if (historyError) throw historyError;
  }
}

export async function syncInitialInvoiceDeliveryHistory(transactionId) {
  const txId = Number(transactionId);
  if (!Number.isFinite(txId) || txId <= 0) throw new Error("Invalid transaction id");

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("id, accountId, date, type, isActive")
    .eq("id", txId)
    .single();
  if (txError) throw txError;
  if (!transaction || !transaction.isActive || Number(transaction.type) !== TRANSACTION_TYPES.sale) return;

  const { data: details, error: detailsError } = await supabase
    .from("transactionDetails")
    .select("id, conceptId, quantity, quantityDelivered")
    .eq("transactionId", txId);
  if (detailsError) throw detailsError;

  const deliveryBatchKey = `invoice-delivery-${txId}`;
  const { data: existingHistoryRows, error: existingHistoryError } = await supabase
    .from("inventory_delivery_history")
    .select('transactionDetailId, quantity, "deliveryBatchKey"')
    .eq("transactionId", txId);
  if (existingHistoryError) throw existingHistoryError;

  const trackedDeliveredByDetailId = new Map();
  (existingHistoryRows ?? []).forEach((row) => {
    if (row.deliveryBatchKey === deliveryBatchKey) return;
    const detailId = Number(row.transactionDetailId || 0);
    if (!detailId) return;
    trackedDeliveredByDetailId.set(
      detailId,
      Number(trackedDeliveredByDetailId.get(detailId) || 0) + Math.max(Number(row.quantity || 0), 0)
    );
  });

  const { error: deleteError } = await supabase
    .from("inventory_delivery_history")
    .delete()
    .eq("transactionId", txId)
    .eq("deliveryBatchKey", deliveryBatchKey);
  if (deleteError) throw deleteError;

  const historyRows = (details ?? [])
    .map((detail) => {
      const quantity = Math.max(Number(detail.quantity || 0), 0);
      const currentDelivered = Math.min(Math.max(Number(detail.quantityDelivered || 0), 0), quantity);
      const trackedDelivered = Math.min(Math.max(Number(trackedDeliveredByDetailId.get(Number(detail.id)) || 0), 0), quantity);
      const delivered = Math.max(Math.min(currentDelivered - trackedDelivered, quantity), 0);
      if (delivered <= 0) return null;
      return {
        accountId: Number(transaction.accountId),
        transactionId: txId,
        transactionDetailId: Number(detail.id),
        conceptId: detail.conceptId ? Number(detail.conceptId) : null,
        deliveryBatchKey,
        deliveryDate: transaction.date,
        quantity: delivered
      };
    })
    .filter(Boolean);

  if (!historyRows.length) return;

  const { error: insertError } = await supabase.from("inventory_delivery_history").insert(historyRows);
  if (insertError) throw insertError;
}

export async function listInventoryDeliveryHistory(transactionId) {
  const txId = Number(transactionId);
  if (!Number.isFinite(txId) || txId <= 0) return [];

  const { data, error } = await supabase
    .from("inventory_delivery_history")
    .select('id, "deliveryBatchKey", "deliveryDate", quantity, "createdAt", conceptId, concepts(name)')
    .eq("transactionId", txId)
    .order("createdAt", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw error;

  const batches = new Map();
  (data ?? []).forEach((row) => {
    const key = row.deliveryBatchKey || `delivery-${row.id}`;
    const current = batches.get(key) || {
      deliveryBatchKey: key,
      deliveryDate: row.deliveryDate || null,
      createdAt: row.createdAt || null,
      lines: []
    };
    current.lines.push({
      id: Number(row.id),
      conceptId: row.conceptId ? Number(row.conceptId) : null,
      productName: row.concepts?.name || "-",
      quantity: Number(row.quantity || 0)
    });
    batches.set(key, current);
  });

  return Array.from(batches.values());
}

export async function listPaymentsForTransaction(transactionId) {
  const { data, error } = await supabase
    .from("transactionDetails")
    .select(
      'id, total, transactionId, transactionPaidId, transactions!transaction_details_transactionId_fkey(id, date, type, name, "referenceNumber", paymentMethodId, accountPaymentFormId, isActive, payment_methods(name), account_payment_forms(name))'
    )
    .eq("transactionPaidId", transactionId)
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    transactions: row.transactions ?? null
  }));
}

async function getAppliedPaymentsSnapshot(transactionId) {
  const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));
  const txId = Number(transactionId);
  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("id, total")
    .eq("id", txId)
    .single();
  if (transactionError) throw transactionError;

  const { data: paymentLinks, error: paymentLinksError } = await supabase
    .from("transactionDetails")
    .select("transactionId, total")
    .eq("transactionPaidId", txId);
  if (paymentLinksError) throw paymentLinksError;

  const paymentTxIds = Array.from(
    new Set((paymentLinks ?? []).map((row) => Number(row.transactionId || 0)).filter((id) => Number.isFinite(id) && id > 0))
  );

  let activePaymentTxIds = new Set();
  if (paymentTxIds.length > 0) {
    const { data: activePayments, error: activePaymentsError } = await supabase
      .from("transactions")
      .select("id")
      .in("id", paymentTxIds)
      .eq("isActive", true);
    if (activePaymentsError) throw activePaymentsError;
    activePaymentTxIds = new Set((activePayments ?? []).map((row) => Number(row.id)));
  }

  const payments = (paymentLinks ?? []).reduce((acc, row) => {
    const paymentId = Number(row.transactionId || 0);
    if (!activePaymentTxIds.has(paymentId)) return acc;
    return acc + Math.abs(Number(row.total || 0));
  }, 0);

  const total = roundCurrency(Math.abs(Number(transaction.total || 0)));
  const normalizedPayments = roundCurrency(payments);
  return {
    total,
    payments: normalizedPayments,
    balance: roundCurrency(Math.max(total - normalizedPayments, 0))
  };
}

export async function registerPaymentForTransaction({
  paidTransaction,
  paymentTransaction,
  paymentDetail
}) {
  const latestPaidTransaction = await getAppliedPaymentsSnapshot(paidTransaction.id);

  const amount = Number(Number(paymentTransaction.total || 0).toFixed(2));
  const availableBalance = Number(Number(latestPaidTransaction.balance || 0).toFixed(2));
  if (amount <= 0 || amount > availableBalance) {
    throw new Error("El monto del pago excede el saldo pendiente.");
  }

  const { data: createdPaymentTx, error: txError } = await supabase
    .from("transactions")
    .insert(paymentTransaction)
    .select("id")
    .single();
  if (txError) throw txError;

  const { error: detailError } = await supabase.from("transactionDetails").insert({
    ...paymentDetail,
    transactionId: createdPaymentTx.id,
    transactionPaidId: paidTransaction.id
  });
  if (detailError) {
    await supabase.from("transactions").delete().eq("id", createdPaymentTx.id);
    throw detailError;
  }

  const currentPayments = Number(Number(latestPaidTransaction.payments || 0).toFixed(2));
  const paymentAmount = Number(Number(paymentTransaction.total || 0).toFixed(2));
  const updatedPayments = Number((currentPayments + paymentAmount).toFixed(2));
  const updatedBalance = Number(Math.max(Number(latestPaidTransaction.total || 0) - updatedPayments, 0).toFixed(2));

  const { error: updatePaidError } = await supabase
    .from("transactions")
    .update({ payments: updatedPayments, balance: updatedBalance })
    .eq("id", paidTransaction.id);
  if (updatePaidError) throw updatePaidError;

  return createdPaymentTx;
}

export async function voidPaymentForTransaction({ paymentTransactionId, paidTransactionId }) {
  const paymentTxId = Number(paymentTransactionId);
  const sourceTxId = Number(paidTransactionId);
  if (!Number.isFinite(paymentTxId) || paymentTxId <= 0) throw new Error("Invalid payment transaction id.");
  if (!Number.isFinite(sourceTxId) || sourceTxId <= 0) throw new Error("Invalid source transaction id.");

  const { data: paymentTx, error: paymentTxError } = await supabase
    .from("transactions")
    .select("id, total, isActive")
    .eq("id", paymentTxId)
    .single();
  if (paymentTxError) throw paymentTxError;
  if (!paymentTx?.isActive) {
    throw new Error("El pago ya fue anulado.");
  }

  const { data: paymentDetail, error: paymentDetailError } = await supabase
    .from("transactionDetails")
    .select("id, transactionPaidId")
    .eq("transactionId", paymentTxId)
    .eq("transactionPaidId", sourceTxId)
    .maybeSingle();
  if (paymentDetailError) throw paymentDetailError;
  if (!paymentDetail) {
    throw new Error("No se encontró la aplicación del pago para esta transacción.");
  }

  const { error: voidPaymentError } = await supabase
    .from("transactions")
    .update({ isActive: false })
    .eq("id", paymentTxId);
  if (voidPaymentError) throw voidPaymentError;

  const paidTransaction = await getAppliedPaymentsSnapshot(sourceTxId);

  const { error: updatePaidError } = await supabase
    .from("transactions")
    .update({ payments: paidTransaction.payments, balance: paidTransaction.balance })
    .eq("id", sourceTxId);
  if (updatePaidError) throw updatePaidError;
}

export async function listTransactionsByAccountPaymentForm({ accountId, accountPaymentFormId }) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      'id, date, type, total, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", "isReconciled", "reconciledAt", "referenceNumber", "isInternalObligation", "sourceTransactionId", "isInternalTransfer", "isDeposit", isActive, name'
    )
    .eq("accountId", accountId)
    .eq("accountPaymentFormId", accountPaymentFormId)
    .eq("isActive", true)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function reconcileTransaction(id, reconciledAt) {
  const { error } = await supabase.from("transactions").update({ isReconciled: true, reconciledAt }).eq("id", id);
  if (error) throw error;
}

export async function unreconcileTransaction(id) {
  const { error } = await supabase.from("transactions").update({ isReconciled: false, reconciledAt: null }).eq("id", id);
  if (error) throw error;
}

export async function listUsedTransactionTags(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("tags")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .not("tags", "is", null)
    .order("id", { ascending: false })
    .limit(2000);

  if (error) throw error;

  const tagsByNormalized = new Map();
  for (const row of data ?? []) {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    for (const rawTag of tags) {
      const normalized = String(rawTag || "").trim().toLowerCase();
      if (!normalized) continue;
      if (!tagsByNormalized.has(normalized)) {
        tagsByNormalized.set(normalized, String(rawTag).trim());
      }
    }
  }

  return Array.from(tagsByNormalized.values()).sort((a, b) => a.localeCompare(b));
}

export async function listInternalObligations(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      'id, date, name, total, payments, balance, currencyId, "referenceNumber", "accountPaymentFormId", "sourceTransactionId", isActive, account_payment_forms(name)'
    )
    .eq("accountId", accountId)
    .eq("isInternalObligation", true)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createInternalObligation({
  accountId,
  userId,
  date,
  name,
  referenceNumber,
  currencyId,
  accountPaymentFormId,
  total
}) {
  const amount = Math.abs(Number(total || 0));
  const payload = {
    accountId,
    personId: null,
    date,
    type: TRANSACTION_TYPES.purchase,
    name: name?.trim() || "Obligación interna",
    referenceNumber: referenceNumber?.trim() || null,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: userId,
    net: amount,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: amount,
    isAccountPayable: true,
    isAccountReceivable: false,
    isIncomingPayment: false,
    isOutcomingPayment: false,
    balance: amount,
    payments: 0,
    isActive: true,
    currencyId: Number(currencyId),
    paymentMethodId: null,
    accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null,
    isInternalObligation: true,
    sourceTransactionId: null,
    isInternalTransfer: false,
    isDeposit: false
  };
  const { data, error } = await supabase.from("transactions").insert(payload).select("id").single();
  if (error) throw error;
  return data;
}

export async function updateInternalObligation(id, { date, name, referenceNumber, currencyId, accountPaymentFormId, total }) {
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("id, payments")
    .eq("id", id)
    .single();
  if (existingError) throw existingError;

  const payments = Math.abs(Number(existing.payments || 0));
  const amount = Math.abs(Number(total || 0));
  if (amount < payments) {
    throw new Error("Total cannot be lower than already registered payments.");
  }

  const payload = {
    date,
    name: name?.trim() || "Obligación interna",
    referenceNumber: referenceNumber?.trim() || null,
    currencyId: Number(currencyId),
    accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null,
    net: amount,
    total: amount,
    payments,
    balance: Math.max(amount - payments, 0)
  };

  const { data, error } = await supabase.from("transactions").update(payload).eq("id", id).select("id").single();
  if (error) throw error;
  return data;
}

export async function listInternalObligationsForReport(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let query = supabase
    .from("transactions")
    .select('id, date, name, total, balance, currencyId')
    .eq("accountId", accountId)
    .eq("isInternalObligation", true)
    .eq("isActive", true);
  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  if (currencyId) query = query.eq("currencyId", currencyId);
  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listEmployeeLoans(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      'id, date, name, total, payments, balance, currencyId, "referenceNumber", "employeeId", "paymentMethodId", "accountPaymentFormId", isActive, employes(name), account_payment_forms(name)'
    )
    .eq("accountId", accountId)
    .eq("isEmployeeLoan", true)
    .is("sourceTransactionId", null)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function getEmployeeLoanSystemConcepts(accountId) {
  const { data, error } = await supabase
    .from("concepts")
    .select("id, isLoanConcept, isLoanPaymentConcept")
    .eq("accountId", accountId)
    .eq("isSystem", true)
    .or("isLoanConcept.eq.true,isLoanPaymentConcept.eq.true");

  if (error) throw error;

  const loanConcept = (data ?? []).find((row) => row.isLoanConcept);
  const loanPaymentConcept = (data ?? []).find((row) => row.isLoanPaymentConcept);
  if (!loanConcept || !loanPaymentConcept) {
    throw new Error("Missing system concepts for employee loans.");
  }

  return {
    loanConceptId: Number(loanConcept.id),
    loanPaymentConceptId: Number(loanPaymentConcept.id)
  };
}

export async function createEmployeeLoan({
  accountId,
  userId,
  employeeId,
  date,
  name,
  referenceNumber,
  currencyId,
  paymentMethodId,
  accountPaymentFormId,
  total
}) {
  const amount = Math.abs(Number(total || 0));
  if (!amount) throw new Error("Invalid amount");

  const { loanConceptId } = await getEmployeeLoanSystemConcepts(accountId);

  const mainPayload = {
    accountId,
    personId: null,
    employeeId: Number(employeeId),
    date,
    type: TRANSACTION_TYPES.purchase,
    name: name?.trim() || "Préstamo",
    referenceNumber: referenceNumber?.trim() || null,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: userId,
    net: amount,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: amount,
    isAccountPayable: false,
    isAccountReceivable: true,
    isIncomingPayment: false,
    isOutcomingPayment: false,
    balance: amount,
    payments: 0,
    isActive: true,
    currencyId: Number(currencyId),
    paymentMethodId: null,
    accountPaymentFormId: null,
    isInternalObligation: false,
    sourceTransactionId: null,
    isInternalTransfer: false,
    isDeposit: false,
    isEmployeeLoan: true
  };

  const { data: mainRow, error: mainError } = await supabase.from("transactions").insert(mainPayload).select("id").single();
  if (mainError) throw mainError;

  const movementPayload = {
    accountId,
    personId: null,
    employeeId: Number(employeeId),
    date,
    type: TRANSACTION_TYPES.outgoingPayment,
    name: `${name?.trim() || "Préstamo"} (desembolso)`,
    referenceNumber: referenceNumber?.trim() || null,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: userId,
    net: -amount,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: -amount,
    isAccountPayable: false,
    isAccountReceivable: false,
    isIncomingPayment: false,
    isOutcomingPayment: true,
    balance: 0,
    payments: -amount,
    isActive: true,
    currencyId: Number(currencyId),
    paymentMethodId: Number(paymentMethodId),
    accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null,
    isInternalObligation: false,
    sourceTransactionId: Number(mainRow.id),
    isInternalTransfer: false,
    isDeposit: false,
    isEmployeeLoan: true
  };

  const { data: movementRow, error: movementError } = await supabase
    .from("transactions")
    .insert(movementPayload)
    .select("id")
    .single();
  if (movementError) {
    await supabase.from("transactions").delete().eq("id", mainRow.id);
    throw movementError;
  }

  const { error: detailError } = await supabase.from("transactionDetails").insert({
    transactionId: movementRow.id,
    conceptId: loanConceptId,
    quantity: 1,
    price: -amount,
    net: -amount,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: -amount,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: null
  });

  if (detailError) {
    await supabase.from("transactions").delete().in("id", [mainRow.id, movementRow.id]);
    throw detailError;
  }

  return mainRow;
}

export async function updateEmployeeLoan(
  id,
  { date, name, referenceNumber, currencyId, employeeId, paymentMethodId, accountPaymentFormId, total }
) {
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("id, payments")
    .eq("id", id)
    .single();
  if (existingError) throw existingError;

  const payments = Math.abs(Number(existing.payments || 0));
  const amount = Math.abs(Number(total || 0));
  if (amount < payments) {
    throw new Error("Total cannot be lower than already registered payments.");
  }

  const { data: movement, error: movementLookupError } = await supabase
    .from("transactions")
    .select("id")
    .eq("sourceTransactionId", id)
    .eq("isEmployeeLoan", true)
    .eq("type", TRANSACTION_TYPES.outgoingPayment)
    .maybeSingle();
  if (movementLookupError) throw movementLookupError;

  const mainPayload = {
    date,
    employeeId: Number(employeeId),
    name: name?.trim() || "Préstamo",
    referenceNumber: referenceNumber?.trim() || null,
    currencyId: Number(currencyId),
    net: amount,
    total: amount,
    payments,
    balance: Math.max(amount - payments, 0)
  };

  const { data, error } = await supabase.from("transactions").update(mainPayload).eq("id", id).select("id").single();
  if (error) throw error;

  if (movement?.id) {
    const movementPayload = {
      date,
      employeeId: Number(employeeId),
      name: `${name?.trim() || "Préstamo"} (desembolso)`,
      referenceNumber: referenceNumber?.trim() || null,
      currencyId: Number(currencyId),
      paymentMethodId: Number(paymentMethodId),
      accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null,
      net: -amount,
      total: -amount,
      payments: -amount
    };
    const { error: movementUpdateError } = await supabase.from("transactions").update(movementPayload).eq("id", movement.id);
    if (movementUpdateError) throw movementUpdateError;

    const { error: detailUpdateError } = await supabase
      .from("transactionDetails")
      .update({
        quantity: 1,
        price: -amount,
        net: -amount,
        taxPercentage: 0,
        tax: 0,
        discountPercentage: 0,
        discount: 0,
        total: -amount,
        additionalCharges: 0
      })
      .eq("transactionId", movement.id);
    if (detailUpdateError) throw detailUpdateError;
  }

  return data;
}

export async function registerEmployeeLoanPayment({
  paidTransaction,
  paymentTransaction,
  paymentDate,
  amount,
  description,
  referenceNumber,
  paymentMethodId,
  accountPaymentFormId,
  userId
}) {
  const safeAmount = Math.abs(Number(amount || 0));
  const { loanPaymentConceptId } = await getEmployeeLoanSystemConcepts(paidTransaction.accountId);

  return registerPaymentForTransaction({
    paidTransaction,
    paymentTransaction: {
      accountId: paidTransaction.accountId,
      personId: null,
      employeeId: paidTransaction.employeeId ?? null,
      date: paymentDate,
      type: TRANSACTION_TYPES.incomingPayment,
      name: description?.trim() || null,
      referenceNumber: referenceNumber?.trim() || null,
      deliverTo: null,
      deliveryAddress: null,
      status: 1,
      createdById: userId,
      net: safeAmount,
      discounts: 0,
      taxes: 0,
      additionalCharges: 0,
      total: safeAmount,
      isAccountPayable: false,
      isAccountReceivable: false,
      isIncomingPayment: true,
      isOutcomingPayment: false,
      balance: 0,
      payments: safeAmount,
      isActive: true,
      currencyId: paidTransaction.currencyId ?? null,
      paymentMethodId: Number(paymentMethodId),
      accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null,
      sourceTransactionId: paidTransaction.id,
      isEmployeeLoan: true,
      ...(paymentTransaction || {})
    },
    paymentDetail: {
      conceptId: loanPaymentConceptId,
      quantity: 1,
      price: safeAmount,
      net: safeAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: safeAmount,
      additionalCharges: 0,
      createdById: userId,
      sellerId: null
    }
  });
}

export async function listEmployeeLoansForReport(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let query = supabase
    .from("transactions")
    .select('id, date, name, total, payments, balance, currencyId, "employeeId", employes(name)')
    .eq("accountId", accountId)
    .eq("isEmployeeLoan", true)
    .is("sourceTransactionId", null)
    .eq("isActive", true);
  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  if (currencyId) query = query.eq("currencyId", currencyId);
  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getEmployeeLoanDisbursementBySourceId(sourceTransactionId) {
  const { data, error } = await supabase
    .from("transactions")
    .select('id, "paymentMethodId", "accountPaymentFormId"')
    .eq("sourceTransactionId", sourceTransactionId)
    .eq("isEmployeeLoan", true)
    .eq("type", TRANSACTION_TYPES.outgoingPayment)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function deactivateEmployeeLoanGroup(loanTransactionId) {
  const { data: linkedRows, error: linkedError } = await supabase
    .from("transactions")
    .select("id")
    .or(`id.eq.${loanTransactionId},sourceTransactionId.eq.${loanTransactionId}`);
  if (linkedError) throw linkedError;

  const ids = Array.from(new Set((linkedRows ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return;

  const { error } = await supabase.from("transactions").update({ isActive: false }).in("id", ids);
  if (error) throw error;
}

export async function createBankDeposit({
  accountId,
  userId,
  date,
  amount,
  currencyId,
  referenceNumber,
  description,
  cashPaymentMethodId,
  transferPaymentMethodId,
  fromCashFormId,
  toBankFormId,
  outgoingConceptId,
  incomingConceptId
}) {
  const safeAmount = Math.abs(Number(amount || 0));
  if (!safeAmount) throw new Error("Invalid amount");

  const baseName = description?.trim() || "Depósito bancario";
  const common = {
    accountId,
    personId: null,
    date,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: userId,
    net: safeAmount,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: safeAmount,
    isAccountPayable: false,
    isAccountReceivable: false,
    balance: 0,
    payments: safeAmount,
    isActive: true,
    currencyId: Number(currencyId),
    referenceNumber: referenceNumber?.trim() || null,
    isInternalObligation: false,
    sourceTransactionId: null,
    isInternalTransfer: true,
    isDeposit: true,
    isCashWithdrawal: false
  };

  const outgoingTx = {
    ...common,
    type: TRANSACTION_TYPES.outgoingPayment,
    name: `${baseName} (salida)`,
    isIncomingPayment: false,
    isOutcomingPayment: true,
    paymentMethodId: Number(cashPaymentMethodId),
    accountPaymentFormId: Number(fromCashFormId)
  };

  const { data: outRow, error: txOutError } = await supabase.from("transactions").insert(outgoingTx).select("id").single();
  if (txOutError) throw txOutError;

  const incomingTx = {
    ...common,
    type: TRANSACTION_TYPES.incomingPayment,
    name: `${baseName} (entrada)`,
    isIncomingPayment: true,
    isOutcomingPayment: false,
    paymentMethodId: Number(transferPaymentMethodId),
    accountPaymentFormId: Number(toBankFormId),
    sourceTransactionId: outRow.id
  };

  const { data: inRow, error: txInError } = await supabase.from("transactions").insert(incomingTx).select("id").single();
  if (txInError) {
    await supabase.from("transactions").delete().eq("id", outRow.id);
    throw txInError;
  }

  const details = [
    {
      transactionId: outRow.id,
      conceptId: Number(outgoingConceptId),
      quantity: 1,
      price: safeAmount,
      net: safeAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: safeAmount,
      additionalCharges: 0,
      createdById: userId,
      sellerId: null,
      transactionPaidId: null
    },
    {
      transactionId: inRow.id,
      conceptId: Number(incomingConceptId),
      quantity: 1,
      price: safeAmount,
      net: safeAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: safeAmount,
      additionalCharges: 0,
      createdById: userId,
      sellerId: null,
      transactionPaidId: null
    }
  ];

  const { error: detailError } = await supabase.from("transactionDetails").insert(details);
  if (detailError) {
    await supabase.from("transactions").delete().in("id", [outRow.id, inRow.id]);
    throw detailError;
  }
}

export async function createBankTransfer({
  accountId,
  userId,
  date,
  amount,
  currencyId,
  referenceNumber,
  description,
  transferPaymentMethodId,
  fromBankFormId,
  toBankFormId,
  fromBankLabel,
  toBankLabel,
  outgoingConceptId,
  incomingConceptId
}) {
  const safeAmount = Math.abs(Number(amount || 0));
  if (!safeAmount) throw new Error("Invalid amount");
  if (Number(fromBankFormId) === Number(toBankFormId)) throw new Error("Source and destination must be different.");

  const baseName = description?.trim() || "Traslado entre cuentas";
  const common = {
    accountId,
    personId: null,
    date,
    referenceNumber: referenceNumber?.trim() || null,
    status: 1,
    createdById: userId,
    net: 0,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    total: 0,
    isAccountPayable: false,
    isAccountReceivable: false,
    isIncomingPayment: false,
    isOutcomingPayment: false,
    balance: 0,
    payments: 0,
    isActive: true,
    currencyId: Number(currencyId),
    paymentMethodId: Number(transferPaymentMethodId),
    isInternalObligation: false,
    isInternalTransfer: true,
    isDeposit: false,
    isCashWithdrawal: false,
    isReconciled: true,
    reconciledAt: date
  };

  const outgoingTx = {
    ...common,
    type: TRANSACTION_TYPES.outgoingPayment,
    name: `${baseName} (salida)`,
    deliverTo: fromBankLabel || null,
    deliveryAddress: toBankLabel || null,
    net: -safeAmount,
    total: -safeAmount,
    isOutcomingPayment: true,
    payments: -safeAmount,
    accountPaymentFormId: Number(fromBankFormId),
    sourceTransactionId: null
  };

  const { data: outTxRow, error: outTxError } = await supabase.from("transactions").insert(outgoingTx).select("id").single();
  if (outTxError) throw outTxError;

  const incomingTx = {
    ...common,
    type: TRANSACTION_TYPES.incomingPayment,
    name: `${baseName} (entrada)`,
    deliverTo: fromBankLabel || null,
    deliveryAddress: toBankLabel || null,
    net: safeAmount,
    total: safeAmount,
    isIncomingPayment: true,
    payments: safeAmount,
    accountPaymentFormId: Number(toBankFormId),
    sourceTransactionId: outTxRow.id
  };

  const { data: inTxRow, error: inTxError } = await supabase.from("transactions").insert(incomingTx).select("id").single();
  if (inTxError) {
    await supabase.from("transactions").delete().eq("id", outTxRow.id);
    throw inTxError;
  }

  const outgoingDetail = {
    transactionId: outTxRow.id,
    conceptId: Number(outgoingConceptId),
    quantity: 1,
    price: -safeAmount,
    net: -safeAmount,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: -safeAmount,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: null
  };

  const incomingDetail = {
    transactionId: inTxRow.id,
    conceptId: Number(incomingConceptId),
    quantity: 1,
    price: safeAmount,
    net: safeAmount,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: safeAmount,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: null
  };

  const { error: outgoingDetailError } = await supabase.from("transactionDetails").insert(outgoingDetail);
  if (outgoingDetailError) {
    await supabase.from("transactions").delete().in("id", [outTxRow.id, inTxRow.id]);
    throw outgoingDetailError;
  }

  const { error: incomingDetailError } = await supabase.from("transactionDetails").insert(incomingDetail);
  if (incomingDetailError) {
    await supabase.from("transactions").delete().in("id", [outTxRow.id, inTxRow.id]);
    throw incomingDetailError;
  }
}

export async function createCashWithdrawal({
  accountId,
  userId,
  date,
  amount,
  currencyId,
  referenceNumber,
  description,
  transferPaymentMethodId,
  cashPaymentMethodId,
  fromBankFormId,
  toCashFormId,
  fromBankLabel,
  toCashLabel,
  cashWithdrawalConceptId
}) {
  const safeAmount = Math.abs(Number(amount || 0));
  if (!safeAmount) throw new Error("Invalid amount");
  if (toCashFormId && Number(fromBankFormId) === Number(toCashFormId)) throw new Error("Source and destination must be different.");

  const baseName = description?.trim() || "Retiro de efectivo";
  const common = {
    accountId,
    personId: null,
    date,
    referenceNumber: referenceNumber?.trim() || null,
    status: 1,
    createdById: userId,
    discounts: 0,
    taxes: 0,
    additionalCharges: 0,
    isAccountPayable: false,
    isAccountReceivable: false,
    balance: 0,
    isActive: true,
    currencyId: Number(currencyId),
    isInternalObligation: false,
    isInternalTransfer: true,
    isDeposit: false,
    isCashWithdrawal: true,
    isReconciled: true,
    reconciledAt: date
  };

  const outgoingTx = {
    ...common,
    type: TRANSACTION_TYPES.outgoingPayment,
    name: `${baseName} (salida)`,
    deliverTo: fromBankLabel || null,
    deliveryAddress: toCashLabel || null,
    net: -safeAmount,
    total: -safeAmount,
    isIncomingPayment: false,
    isOutcomingPayment: true,
    payments: -safeAmount,
    paymentMethodId: Number(transferPaymentMethodId),
    accountPaymentFormId: Number(fromBankFormId),
    sourceTransactionId: null
  };

  const { data: outTxRow, error: outTxError } = await supabase.from("transactions").insert(outgoingTx).select("id").single();
  if (outTxError) throw outTxError;

  const incomingTx = {
    ...common,
    type: TRANSACTION_TYPES.incomingPayment,
    name: `${baseName} (entrada)`,
    deliverTo: fromBankLabel || null,
    deliveryAddress: toCashLabel || "Efectivo",
    net: safeAmount,
    total: safeAmount,
    isIncomingPayment: true,
    isOutcomingPayment: false,
    payments: safeAmount,
    paymentMethodId: Number(cashPaymentMethodId),
    accountPaymentFormId: toCashFormId ? Number(toCashFormId) : null,
    sourceTransactionId: outTxRow.id
  };

  const { data: inTxRow, error: inTxError } = await supabase.from("transactions").insert(incomingTx).select("id").single();
  if (inTxError) {
    await supabase.from("transactions").delete().eq("id", outTxRow.id);
    throw inTxError;
  }

  const outgoingDetail = {
    transactionId: outTxRow.id,
    conceptId: Number(cashWithdrawalConceptId),
    quantity: 1,
    price: -safeAmount,
    net: -safeAmount,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: -safeAmount,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: null
  };

  const incomingDetail = {
    transactionId: inTxRow.id,
    conceptId: Number(cashWithdrawalConceptId),
    quantity: 1,
    price: safeAmount,
    net: safeAmount,
    taxPercentage: 0,
    tax: 0,
    discountPercentage: 0,
    discount: 0,
    total: safeAmount,
    additionalCharges: 0,
    createdById: userId,
    sellerId: null,
    transactionPaidId: null
  };

  const { error: outgoingDetailError } = await supabase.from("transactionDetails").insert(outgoingDetail);
  if (outgoingDetailError) {
    await supabase.from("transactions").delete().in("id", [outTxRow.id, inTxRow.id]);
    throw outgoingDetailError;
  }

  const { error: incomingDetailError } = await supabase.from("transactionDetails").insert(incomingDetail);
  if (incomingDetailError) {
    await supabase.from("transactions").delete().in("id", [outTxRow.id, inTxRow.id]);
    throw incomingDetailError;
  }
}

export async function listBankDeposits(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select('id, date, name, total, "referenceNumber", "sourceTransactionId", "accountPaymentFormId", isActive, account_payment_forms(name)')
    .eq("accountId", accountId)
    .eq("isDeposit", true)
    .eq("isIncomingPayment", true)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBankDepositGroup(incomingDepositId) {
  const { data: incomingTx, error: incomingError } = await supabase
    .from("transactions")
    .select('id, date, name, total, currencyId, "referenceNumber", "accountPaymentFormId", "sourceTransactionId", isDeposit, isIncomingPayment, isActive')
    .eq("id", incomingDepositId)
    .eq("isDeposit", true)
    .eq("isIncomingPayment", true)
    .single();
  if (incomingError) throw incomingError;

  if (!incomingTx?.sourceTransactionId) {
    throw new Error("Deposit source transaction not found.");
  }

  const { data: outgoingTx, error: outgoingError } = await supabase
    .from("transactions")
    .select('id, name, "accountPaymentFormId", isDeposit, isOutcomingPayment, isActive')
    .eq("id", incomingTx.sourceTransactionId)
    .eq("isDeposit", true)
    .eq("isOutcomingPayment", true)
    .single();
  if (outgoingError) throw outgoingError;

  return {
    incoming: incomingTx,
    outgoing: outgoingTx
  };
}

export async function updateBankDepositGroup({
  incomingDepositId,
  date,
  amount,
  currencyId,
  referenceNumber,
  description,
  cashPaymentMethodId,
  transferPaymentMethodId,
  fromCashFormId,
  toBankFormId,
  outgoingConceptId,
  incomingConceptId
}) {
  const safeAmount = Math.abs(Number(amount || 0));
  if (!safeAmount) throw new Error("Invalid amount");

  const depositGroup = await getBankDepositGroup(incomingDepositId);
  const outgoingId = Number(depositGroup.outgoing?.id || 0);
  const incomingId = Number(depositGroup.incoming?.id || 0);
  if (!incomingId || !outgoingId) throw new Error("Deposit transactions not found.");

  const baseName = description?.trim() || "Depósito bancario";

  const outgoingTx = {
    date,
    name: `${baseName} (salida)`,
    net: safeAmount,
    total: safeAmount,
    payments: safeAmount,
    currencyId: Number(currencyId),
    referenceNumber: referenceNumber?.trim() || null,
    paymentMethodId: Number(cashPaymentMethodId),
    accountPaymentFormId: Number(fromCashFormId)
  };

  const incomingTx = {
    date,
    name: `${baseName} (entrada)`,
    net: safeAmount,
    total: safeAmount,
    payments: safeAmount,
    currencyId: Number(currencyId),
    referenceNumber: referenceNumber?.trim() || null,
    paymentMethodId: Number(transferPaymentMethodId),
    accountPaymentFormId: Number(toBankFormId)
  };

  const { error: outgoingTxError } = await supabase.from("transactions").update(outgoingTx).eq("id", outgoingId);
  if (outgoingTxError) throw outgoingTxError;

  const { error: incomingTxError } = await supabase.from("transactions").update(incomingTx).eq("id", incomingId);
  if (incomingTxError) throw incomingTxError;

  const { error: outgoingDetailError } = await supabase
    .from("transactionDetails")
    .update({
      conceptId: Number(outgoingConceptId),
      quantity: 1,
      price: safeAmount,
      net: safeAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: safeAmount,
      additionalCharges: 0
    })
    .eq("transactionId", outgoingId);
  if (outgoingDetailError) throw outgoingDetailError;

  const { error: incomingDetailError } = await supabase
    .from("transactionDetails")
    .update({
      conceptId: Number(incomingConceptId),
      quantity: 1,
      price: safeAmount,
      net: safeAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: safeAmount,
      additionalCharges: 0
    })
    .eq("transactionId", incomingId);
  if (incomingDetailError) throw incomingDetailError;
}

export async function deactivateBankDepositGroup(incomingDepositId) {
  const { data: incomingTx, error: incomingError } = await supabase
    .from("transactions")
    .select('id, "sourceTransactionId"')
    .eq("id", incomingDepositId)
    .single();
  if (incomingError) throw incomingError;

  const ids = [incomingTx.id];
  if (incomingTx.sourceTransactionId) ids.push(incomingTx.sourceTransactionId);

  const { error } = await supabase.from("transactions").update({ isActive: false }).in("id", ids);
  if (error) throw error;
}

export async function listBankTransfers(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select('id, date, name, total, "referenceNumber", "sourceTransactionId", deliverTo, "deliveryAddress", isActive, account_payment_forms(name)')
    .eq("accountId", accountId)
    .eq("isInternalTransfer", true)
    .eq("isDeposit", false)
    .eq("isCashWithdrawal", false)
    .eq("isIncomingPayment", true)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deactivateBankTransfer(incomingTransferId) {
  const { data: incomingTx, error: incomingError } = await supabase
    .from("transactions")
    .select('id, "sourceTransactionId"')
    .eq("id", incomingTransferId)
    .single();
  if (incomingError) throw incomingError;

  const ids = [incomingTx.id];
  if (incomingTx.sourceTransactionId) ids.push(incomingTx.sourceTransactionId);

  const { error } = await supabase.from("transactions").update({ isActive: false }).in("id", ids);
  if (error) throw error;
}

export async function listCashWithdrawals(accountId) {
  const { data, error } = await supabase
    .from("transactions")
    .select('id, date, name, total, "referenceNumber", "sourceTransactionId", deliverTo, "deliveryAddress", isActive, account_payment_forms(name)')
    .eq("accountId", accountId)
    .eq("isCashWithdrawal", true)
    .eq("isIncomingPayment", true)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deactivateCashWithdrawal(incomingCashWithdrawalId) {
  const { data: incomingTx, error: incomingError } = await supabase
    .from("transactions")
    .select('id, "sourceTransactionId"')
    .eq("id", incomingCashWithdrawalId)
    .single();
  if (incomingError) throw incomingError;

  const ids = [incomingTx.id];
  if (incomingTx.sourceTransactionId) ids.push(incomingTx.sourceTransactionId);

  const { error } = await supabase.from("transactions").update({ isActive: false }).in("id", ids);
  if (error) throw error;
}
