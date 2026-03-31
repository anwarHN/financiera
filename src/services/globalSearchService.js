import { supabase } from "../lib/supabase";

function buildTextSearchFilter(term) {
  return `name.ilike.%${term}%,referenceNumber.ilike.%${term}%,printNumber.ilike.%${term}%,deliverTo.ilike.%${term}%,deliveryAddress.ilike.%${term}%`;
}

function buildTransactionSearchFilter(term) {
  const baseFilter = buildTextSearchFilter(term);
  if (!/^\d+$/.test(String(term || "").trim())) {
    return baseFilter;
  }

  return `id.eq.${Number(term)},${baseFilter}`;
}

function buildPersonSearchFilter(term) {
  return `name.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%`;
}

export async function searchGlobalByAccount({ accountId, term, limit = 8 }) {
  const normalizedTerm = String(term || "").trim();
  if (!accountId || normalizedTerm.length < 2) {
    return {
      transactions: [],
      clients: [],
      providers: [],
      products: [],
      concepts: [],
      deposits: []
    };
  }

  const [
    transactionsRes,
    clientsRes,
    providersRes,
    productsRes,
    conceptsRes,
    depositsRes
  ] = await Promise.allSettled([
    supabase
      .from("transactions")
      .select('id, type, date, name, "referenceNumber", "printNumber", "isDeposit"')
      .eq("accountId", accountId)
      .eq("isActive", true)
      .eq("isDeposit", false)
      .or(buildTransactionSearchFilter(normalizedTerm))
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("persons")
      .select("id, type, name, phone, address")
      .eq("accountId", accountId)
      .eq("type", 1)
      .or(buildPersonSearchFilter(normalizedTerm))
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("persons")
      .select("id, type, name, phone, address")
      .eq("accountId", accountId)
      .eq("type", 2)
      .or(buildPersonSearchFilter(normalizedTerm))
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("concepts")
      .select("id, name, isProduct")
      .eq("accountId", accountId)
      .eq("isGroup", false)
      .eq("isProduct", true)
      .ilike("name", `%${normalizedTerm}%`)
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("concepts")
      .select("id, name, isProduct")
      .eq("accountId", accountId)
      .eq("isProduct", false)
      .ilike("name", `%${normalizedTerm}%`)
      .order("id", { ascending: false })
      .limit(limit),
    supabase
      .from("transactions")
      .select('id, date, name, "referenceNumber", "printNumber", total')
      .eq("accountId", accountId)
      .eq("isActive", true)
      .eq("isDeposit", true)
      .or(buildTransactionSearchFilter(normalizedTerm))
      .order("id", { ascending: false })
      .limit(limit)
  ]);

  const resolveRows = (result) => {
    if (result.status !== "fulfilled") return [];
    if (result.value.error) return [];
    return result.value.data ?? [];
  };

  return {
    transactions: resolveRows(transactionsRes),
    clients: resolveRows(clientsRes),
    providers: resolveRows(providersRes),
    products: resolveRows(productsRes),
    concepts: resolveRows(conceptsRes),
    deposits: resolveRows(depositsRes)
  };
}
