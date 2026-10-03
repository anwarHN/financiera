import { fetchAllPages } from "./fetchAllPages.js";

const ID_BATCH_SIZE = 500;

export async function loadProductInventoryRows(client, { accountId, productIds }) {
  const normalizedProductIds = Array.from(new Set((productIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)));
  if (!normalizedProductIds.length) return { details: [], historyRows: [], transactions: [] };

  const details = await fetchAllPages((from, to) => client
    .from("transactionDetails")
    .select('id, transactionId, conceptId, quantity, quantityDelivered, "historicalQuantityDelivered"')
    .in("conceptId", normalizedProductIds)
    .order("id", { ascending: true })
    .range(from, to));

  const historyRows = await fetchAllPages((from, to) => client
    .from("inventory_delivery_history")
    .select('id, transactionId, "transactionDetailId", conceptId, "deliveryDate", quantity')
    .eq("accountId", accountId)
    .in("conceptId", normalizedProductIds)
    .order("id", { ascending: true })
    .range(from, to));

  const transactionIds = Array.from(new Set([...details, ...historyRows]
    .map((row) => Number(row.transactionId))
    .filter((id) => Number.isFinite(id) && id > 0)));
  if (!transactionIds.length) return { details, historyRows, transactions: [] };

  const transactions = [];
  for (let index = 0; index < transactionIds.length; index += ID_BATCH_SIZE) {
    const idBatch = transactionIds.slice(index, index + ID_BATCH_SIZE);
    transactions.push(...await fetchAllPages((from, to) => client
      .from("transactions")
      .select('id, accountId, date, type, name, "referenceNumber", isActive, tags')
      .in("id", idBatch)
      .eq("accountId", accountId)
      .eq("isActive", true)
      .order("id", { ascending: true })
      .range(from, to)));
  }

  return { details, historyRows, transactions };
}
