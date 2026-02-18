import { supabase } from "../lib/supabase";

export const DASHBOARD_TYPES = {
  sale: 1,
  expense: 2,
  income: 3
};

function toMonthKey(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBounds() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    daysInMonth: last.getDate()
  };
}

function recentMonths(count = 6) {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

export async function getDashboardData(accountId, language = "es") {
  const { data: forms, error: formsError } = await supabase
    .from("account_payment_forms")
    .select('id, name, kind, provider, reference, "isActive"')
    .eq("accountId", accountId)
    .eq("isActive", true);
  if (formsError) throw formsError;

  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select('id, date, type, total, balance, "accountPaymentFormId", "isInternalObligation", "isActive"')
    .eq("accountId", accountId)
    .eq("isActive", true);
  if (txError) throw txError;

  const txIds = (transactions ?? []).map((row) => row.id);
  let details = [];
  if (txIds.length > 0) {
    const { data: detailsData, error: detailsError } = await supabase
      .from("transactionDetails")
      .select('transactionId, conceptId, total, concepts(name)')
      .in("transactionId", txIds);
    if (detailsError) throw detailsError;
    details = detailsData ?? [];
  }

  const formsById = new Map((forms ?? []).map((row) => [Number(row.id), row]));
  const txById = new Map((transactions ?? []).map((row) => [Number(row.id), row]));

  const bankAccounts = (forms ?? []).filter((row) => row.kind === "bank_account");
  const bankBalances = bankAccounts.map((form) => {
    const total = (transactions ?? [])
      .filter((tx) => Number(tx.accountPaymentFormId) === Number(form.id))
      .reduce((acc, tx) => acc + Number(tx.total || 0), 0);
    return {
      id: form.id,
      name: form.name,
      provider: form.provider,
      balance: total
    };
  });

  const { from: monthFrom, to: monthTo, daysInMonth } = monthBounds();
  const salesDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const salesByDayMap = new Map(salesDays.map((day) => [day, 0]));

  (transactions ?? [])
    .filter((tx) => tx.type === DASHBOARD_TYPES.sale && tx.date >= monthFrom && tx.date <= monthTo)
    .forEach((tx) => {
      const day = Number(String(tx.date).slice(-2));
      salesByDayMap.set(day, Number(salesByDayMap.get(day) || 0) + Number(tx.total || 0));
    });

  const expenseByConcept = new Map();
  const incomeByConcept = new Map();

  details.forEach((detail) => {
    const tx = txById.get(Number(detail.transactionId));
    if (!tx || tx.date < monthFrom || tx.date > monthTo) return;

    const conceptName = detail.concepts?.name || `#${detail.conceptId}`;
    const amount = Math.abs(Number(detail.total || 0));

    if (tx.type === DASHBOARD_TYPES.expense) {
      expenseByConcept.set(conceptName, Number(expenseByConcept.get(conceptName) || 0) + amount);
    }
    if (tx.type === DASHBOARD_TYPES.income) {
      incomeByConcept.set(conceptName, Number(incomeByConcept.get(conceptName) || 0) + amount);
    }
  });

  const monthKeys = recentMonths(6);
  const monthLabelFormatter = new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    month: "short",
    year: "2-digit"
  });
  const monthLineMap = new Map(monthKeys.map((key) => [key, { income: 0, expense: 0 }]));

  (transactions ?? []).forEach((tx) => {
    const key = toMonthKey(tx.date);
    if (!monthLineMap.has(key)) return;
    const current = monthLineMap.get(key);
    if (tx.type === DASHBOARD_TYPES.income) current.income += Math.abs(Number(tx.total || 0));
    if (tx.type === DASHBOARD_TYPES.expense) current.expense += Math.abs(Number(tx.total || 0));
    monthLineMap.set(key, current);
  });

  const internalByForm = new Map();
  (transactions ?? [])
    .filter((tx) => tx.isInternalObligation)
    .forEach((tx) => {
      const form = formsById.get(Number(tx.accountPaymentFormId));
      const label = form?.name || "-";
      internalByForm.set(label, Number(internalByForm.get(label) || 0) + Math.abs(Number(tx.balance || tx.total || 0)));
    });

  return {
    bankBalances,
    salesByDay: {
      labels: salesDays.map((day) => String(day)),
      values: salesDays.map((day) => Number(salesByDayMap.get(day) || 0))
    },
    expensesByConcept: {
      labels: [...expenseByConcept.keys()],
      values: [...expenseByConcept.values()]
    },
    incomesByConcept: {
      labels: [...incomeByConcept.keys()],
      values: [...incomeByConcept.values()]
    },
    incomeExpenseLine: {
      labels: monthKeys.map((key) => {
        const [year, month] = key.split("-").map(Number);
        return monthLabelFormatter.format(new Date(year, month - 1, 1));
      }),
      incomeValues: monthKeys.map((key) => monthLineMap.get(key)?.income || 0),
      expenseValues: monthKeys.map((key) => monthLineMap.get(key)?.expense || 0)
    },
    internalObligationsByPaymentForm: {
      labels: [...internalByForm.keys()],
      values: [...internalByForm.values()]
    }
  };
}
