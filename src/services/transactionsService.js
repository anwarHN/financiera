import { supabase } from "../lib/supabase";

export const TRANSACTION_TYPES = {
  sale: 1,
  expense: 2,
  income: 3,
  purchase: 4,
  outgoingPayment: 5,
  incomingPayment: 6
};

export async function listTransactions({ accountId, type, excludeInternalObligations = false }) {
  let query = supabase
    .from("transactions")
    .select(
      'id, personId, date, type, status, total, balance, payments, name, currencyId, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "sourceTransactionId", "isInternalTransfer", "isDeposit", isActive, persons(name), projects(name), account_payment_forms(name)'
    )
    .eq("accountId", accountId)
    .eq("type", type);

  if (excludeInternalObligations) {
    query = query.eq("isInternalObligation", false);
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

  const detailsToInsert = details.map((detail) => ({
    ...detail,
    transactionId: createdTransaction.id
  }));

  const { error: detailError } = await supabase.from("transactionDetails").insert(detailsToInsert);

  if (detailError) {
    await supabase.from("transactions").delete().eq("id", createdTransaction.id);
    throw detailError;
  }

  return createdTransaction;
}

export async function createTransactionWithDetail({ transaction, detail }) {
  return createTransactionWithDetails({ transaction, details: [detail] });
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
      'id, accountId, personId, date, type, name, total, balance, payments, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "sourceTransactionId", "isInternalTransfer", "isDeposit", isActive, currencyId, persons(name), projects(name), account_payment_forms(name)'
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listTransactionDetails(transactionId) {
  const { data, error } = await supabase
    .from("transactionDetails")
    .select("id, conceptId, quantity, price, net, taxPercentage, tax, discountPercentage, discount, total, additionalCharges, transactionPaidId, concepts(name)")
    .eq("transactionId", transactionId)
    .order("id");
  if (error) throw error;
  return data ?? [];
}

export async function listPaymentsForTransaction(transactionId) {
  const { data, error } = await supabase
    .from("transactionDetails")
    .select(
      'id, total, transactionId, transactionPaidId, transactions!transaction_details_transactionId_fkey(id, date, type, name, "referenceNumber", paymentMethodId, accountPaymentFormId)'
    )
    .eq("transactionPaidId", transactionId)
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    transactions: row.transactions ?? null
  }));
}

export async function registerPaymentForTransaction({
  paidTransaction,
  paymentTransaction,
  paymentDetail
}) {
  const { data: latestPaidTransaction, error: latestPaidError } = await supabase
    .from("transactions")
    .select("id, total, balance, payments")
    .eq("id", paidTransaction.id)
    .single();
  if (latestPaidError) throw latestPaidError;

  const amount = Number(paymentTransaction.total || 0);
  if (amount <= 0 || amount > Number(latestPaidTransaction.balance || 0)) {
    throw new Error("Payment amount exceeds current balance.");
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

  const currentPayments = Number(latestPaidTransaction.payments || 0);
  const paymentAmount = Number(paymentTransaction.total || 0);
  const updatedPayments = currentPayments + paymentAmount;
  const updatedBalance = Math.max(Number(latestPaidTransaction.total || 0) - updatedPayments, 0);

  const { error: updatePaidError } = await supabase
    .from("transactions")
    .update({ payments: updatedPayments, balance: updatedBalance })
    .eq("id", paidTransaction.id);
  if (updatePaidError) throw updatePaidError;

  return createdPaymentTx;
}

export async function listTransactionsByAccountPaymentForm({ accountId, accountPaymentFormId }) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      'id, date, type, total, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", "isReconciled", "reconciledAt", "referenceNumber", "isInternalObligation", "sourceTransactionId", "isInternalTransfer", "isDeposit", name'
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
    isDeposit: true
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
