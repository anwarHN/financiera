import { supabase } from "../lib/supabase";

const selectColumns =
  "id, name, parentConceptId, isGroup, isIncome, isExpense, isProduct, productType, isPaymentForm, isAccountPayableConcept, isIncomingPaymentConcept, isOutgoingPaymentConcept, isLoanConcept, isLoanPaymentConcept, isCashWithdrawalConcept, isSystem, taxPercentage, price, additionalCharges";

async function attachParentConcept(rows) {
  const source = Array.isArray(rows) ? rows : [];
  if (!source.length) return source;

  const parentIds = Array.from(
    new Set(
      source
        .map((row) => Number(row.parentConceptId || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (!parentIds.length) {
    return source.map((row) => ({ ...row, parentConcept: null }));
  }

  const { data: parentRows, error: parentError } = await supabase.from("concepts").select("id, name").in("id", parentIds);
  if (parentError) {
    throw parentError;
  }

  const parentById = new Map((parentRows ?? []).map((row) => [Number(row.id), row]));
  return source.map((row) => {
    const parent = parentById.get(Number(row.parentConceptId || 0));
    return {
      ...row,
      parentConcept: parent ? { name: parent.name } : null
    };
  });
}

async function attachProductStock(rows) {
  const source = Array.isArray(rows) ? rows : [];
  if (!source.length) return source;

  const inventoryProductIds = source
    .filter((row) => row.productType !== "service")
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const productIds = inventoryProductIds;
  if (!productIds.length) return source.map((row) => ({ ...row, stock: 0, pendingDelivery: 0, stockFinal: 0 }));

  const { data: details, error: detailsError } = await supabase
    .from("transactionDetails")
    .select("transactionId, conceptId, quantity, quantityDelivered")
    .in("conceptId", productIds);
  if (detailsError) throw detailsError;

  const txIds = Array.from(new Set((details ?? []).map((row) => Number(row.transactionId)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!txIds.length) return source.map((row) => ({ ...row, stock: 0, pendingDelivery: 0, stockFinal: 0 }));

  const { data: txRows, error: txError } = await supabase
    .from("transactions")
    .select("id, type, tags, isActive")
    .in("id", txIds)
    .eq("isActive", true);
  if (txError) throw txError;

  const txById = new Map((txRows ?? []).map((row) => [Number(row.id), row]));
  const stockByProductId = new Map();
  const pendingByProductId = new Map();

  for (const detail of details ?? []) {
    const productId = Number(detail.conceptId);
    const tx = txById.get(Number(detail.transactionId));
    if (!tx) continue;

    const qty = Number(detail.quantity || 0);
    if (!Number.isFinite(qty) || qty === 0) continue;

    let delta = 0;
    if (Number(tx.type) === 4) {
      delta = Math.abs(qty);
    } else if (Number(tx.type) === 1) {
      delta = -Math.abs(qty);
      const delivered = Math.max(Number(detail.quantityDelivered || 0), 0);
      const pending = Math.max(Math.abs(qty) - delivered, 0);
      if (pending > 0) {
        pendingByProductId.set(productId, Number(pendingByProductId.get(productId) || 0) + pending);
      }
    } else if (Number(tx.type) === 2 && Array.isArray(tx.tags) && tx.tags.includes("__inventory_adjustment__")) {
      delta = qty;
    }

    if (delta !== 0) {
      stockByProductId.set(productId, Number(stockByProductId.get(productId) || 0) + delta);
    }
  }

  return source.map((row) => ({
    ...row,
    stock: Number(stockByProductId.get(Number(row.id)) || 0),
    pendingDelivery: Number(pendingByProductId.get(Number(row.id)) || 0),
    stockFinal:
      Number(stockByProductId.get(Number(row.id)) || 0) + Number(pendingByProductId.get(Number(row.id)) || 0)
  }));
}

export async function listConcepts(accountId) {
  const { data, error } = await supabase
    .from("concepts")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  const withParent = await attachParentConcept(data ?? []);
  return attachProductStock(withParent);
}

export async function listConceptsByModule(accountId, moduleType) {
  let query = supabase.from("concepts").select(selectColumns).eq("accountId", accountId);

  if (moduleType === "products") {
    query = query.eq("isProduct", true).eq("isGroup", false);
  }

  if (moduleType === "income") {
    query = query.eq("isIncome", true).eq("isProduct", false).eq("isGroup", false).eq("isIncomingPaymentConcept", false);
  }

  if (moduleType === "expense") {
    query = query
      .eq("isExpense", true)
      .eq("isGroup", false)
      .eq("isOutgoingPaymentConcept", false)
      .eq("isAccountPayableConcept", false);
  }

  if (moduleType === "groups") {
    query = query.eq("isGroup", true);
  }

  if (moduleType === "payable") {
    query = query.eq("isAccountPayableConcept", true).eq("isGroup", false);
  }

  const { data, error } = await query.order("id", { ascending: false });

  if (error) {
    throw error;
  }

  const withParent = await attachParentConcept(data ?? []);
  if (moduleType === "products") {
    return attachProductStock(withParent);
  }
  return withParent;
}

export async function getConceptById(id) {
  const { data, error } = await supabase.from("concepts").select(selectColumns).eq("id", id).single();

  if (error) {
    throw error;
  }

  const enriched = await attachParentConcept(data ? [data] : []);
  return enriched[0] ?? null;
}

export async function createConcept(payload) {
  const { data, error } = await supabase.from("concepts").insert(payload).select(selectColumns).single();

  if (error) {
    throw error;
  }

  const enriched = await attachParentConcept(data ? [data] : []);
  return enriched[0] ?? null;
}

export async function updateConcept(id, payload) {
  const { data, error } = await supabase
    .from("concepts")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();

  if (error) {
    throw error;
  }

  const enriched = await attachParentConcept(data ? [data] : []);
  return enriched[0] ?? null;
}

export async function deleteConcept(id) {
  const { error } = await supabase.from("concepts").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
