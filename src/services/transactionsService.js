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
      'id, personId, "employeeId", date, type, status, total, balance, payments, name, tags, currencyId, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "isEmployeeLoan", "sourceTransactionId", "isInternalTransfer", "isDeposit", isActive, persons(name), employes(name), projects(name), account_payment_forms(name)'
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
      'id, accountId, personId, "employeeId", date, type, name, tags, total, balance, payments, "projectId", "referenceNumber", "paymentMethodId", "accountPaymentFormId", "isReconciled", "reconciledAt", "isInternalObligation", "isEmployeeLoan", "sourceTransactionId", "isInternalTransfer", "isDeposit", isActive, currencyId, persons(name), employes(name), projects(name), account_payment_forms(name)'
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
