import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { supabase } from "../lib/supabase";
import { listCustomerCredits, customerCreditCommand } from "../services/customerCreditsService";
import { listCurrencies } from "../services/currenciesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { summarizeCredits } from "../../supabase/functions/_shared/customerCredits.js";
import { fetchAllPages } from "../../supabase/functions/_shared/fetchAllPages.js";
import { formatNumber } from "../utils/numberFormat";
import ReadOnlyField from "../components/form/ReadOnlyField";

const today = () => new Date().toLocaleDateString("en-CA");
const initialForm = () => ({
  action: "opening", personId: "", currencyId: "", creditId: "", invoiceId: "",
  amount: "", date: today(), reference: "", paymentMethodId: "", accountPaymentFormId: "",
  requestId: crypto.randomUUID()
});

export default function CustomerCreditsPage() {
  const { account } = useAuth();
  const { t } = useI18n();
  const { canRead, canCreate, canVoidTransactions } = useModulePermissions("transactions");
  const [entries, setEntries] = useState([]);
  const [people, setPeople] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [methods, setMethods] = useState([]);
  const [forms, setForms] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [asOf, setAsOf] = useState(today);
  const [personFilter, setPersonFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setForm(null); setEntries([]); setPeople([]); setCurrencies([]); setInvoices([]);
    setPersonFilter(""); setCurrencyFilter("");
  }, [account?.accountId]);

  useEffect(() => {
    if (!account?.accountId || !canRead) return;
    let cancelled = false;
    setBusy(true); setError("");
    Promise.all([
      listCustomerCredits(account.accountId, asOf),
      fetchAllPages((from, to) => supabase.from("persons").select("id,name").eq("accountId", account.accountId).eq("type", 1).order("id").range(from, to)),
      listCurrencies(account.accountId), listPaymentMethods(account.accountId), listAccountPaymentForms(account.accountId),
      fetchAllPages((from, to) => supabase.from("transactions").select("id,personId,currencyId,balance,date,referenceNumber")
        .eq("accountId", account.accountId).eq("isActive", true).eq("isAccountReceivable", true).gt("balance", 0).order("id").range(from, to))
    ]).then(([history, customers, money, paymentMethods, paymentForms, debts]) => {
      if (cancelled) return;
      setEntries(history); setPeople(customers); setCurrencies(money); setMethods(paymentMethods); setForms(paymentForms); setInvoices(debts);
    }).catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [account?.accountId, asOf, canRead, reload]);

  if (!canRead) return <p>{t("common.accessDeniedDescription")}</p>;
  const visible = (entry) => (!personFilter || String(entry.personId) === personFilter) && (!currencyFilter || String(entry.currencyId) === currencyFilter);
  const credits = summarizeCredits(entries, asOf).filter(visible);
  const history = entries.filter(visible);
  const selectedCredit = credits.find((entry) => String(entry.id) === form?.creditId);
  const cashOperation = form && ["receive", "refund"].includes(form.action);
  const receiptApplied = form?.action === "receive"
    ? Math.min(Number(form.amount) || 0, Number(invoices.find((tx) => String(tx.id) === form.invoiceId)?.balance) || 0)
    : 0;
  const money = (value, currencyId) => formatNumber(value, { currencySymbol: currencies.find((item) => Number(item.id) === Number(currencyId))?.symbol || "" });
  const change = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const start = (action, entry = null) => setForm({
    ...initialForm(), action,
    personId: String(entry?.personId || personFilter || ""),
    currencyId: String(entry?.currencyId || currencyFilter || ""),
    creditId: entry ? String(entry.id) : ""
  });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !(form.action === "reverse" ? canVoidTransactions : canCreate)) return;
    try {
      setBusy(true); setError("");
      await customerCreditCommand(account.accountId, form, form.requestId);
      setForm(null); setReload((value) => value + 1);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <div className="module-page">
    <h1>{t("customerCredits.title")}</h1>
    <p>{t("customerCredits.help")}</p>
    {error && <p className="error-text">{error}</p>}
    <div className="form-grid-2">
      <label className="field-block"><span>{t("reports.dateTo")}</span><input type="date" required value={asOf} onChange={(e) => setAsOf(e.target.value || today())} /></label>
      <label className="field-block"><span>{t("transactions.person")}</span><select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
        <option value="">{t("common.all")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label className="field-block"><span>{t("transactions.currency")}</span><select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
        <option value="">{t("common.all")}</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
    </div>
    {canCreate && <div className="crud-form-actions">
      <button disabled={busy} onClick={() => start("opening")}>{t("customerCredits.opening")}</button>
      <button disabled={busy} onClick={() => start("receive")}>{t("customerCredits.receive")}</button>
    </div>}
    {currencies.filter((c) => credits.some((entry) => Number(entry.currencyId) === Number(c.id))).map((c) =>
      <ReadOnlyField key={c.id} label={`${t("customerCredits.available")} (${c.name})`}
        value={money(credits.filter((entry) => Number(entry.currencyId) === Number(c.id)).reduce((sum, entry) => sum + entry.available, 0), c.id)} />)}
    {busy && <p>{t("common.loading")}</p>}
    <table className="crud-table"><thead><tr>
      <th>{t("transactions.person")}</th><th>{t("transactions.referenceNumber")}</th><th>{t("transactions.currency")}</th>
      <th>{t("transactions.amount")}</th><th>{t("customerCredits.used")}</th><th>{t("customerCredits.available")}</th><th>{t("common.actions")}</th>
    </tr></thead><tbody>
      {credits.map((entry) => <tr key={entry.id}>
        <td>{entry.persons?.name}</td><td>{entry.reference}</td><td>{entry.currencies?.name}</td>
        <td>{money(entry.amount, entry.currencyId)}</td><td>{money(entry.applied, entry.currencyId)}</td><td>{money(entry.available, entry.currencyId)}</td>
        <td>{canCreate && entry.available > 0 && <>
          <button className="button-link-secondary" disabled={busy} onClick={() => start("application", entry)}>{t("customerCredits.application")}</button>
          <button className="button-link-secondary" disabled={busy} onClick={() => start("refund", entry)}>{t("customerCredits.refund")}</button>
        </>}</td>
      </tr>)}
    </tbody></table>
    <h2>{t("customerCredits.history")}</h2>
    <table className="crud-table"><thead><tr>
      <th>ID</th><th>{t("transactions.date")}</th><th>{t("transactions.person")}</th><th>{t("common.type")}</th>
      <th>{t("transactions.referenceNumber")}</th><th>{t("customerCredits.originInvoice")}</th><th>{t("transactions.amount")}</th><th>{t("common.status")}</th><th>{t("common.actions")}</th>
    </tr></thead><tbody>{history.map((entry) => <tr key={entry.id}>
      <td>{entry.id}</td><td>{entry.date}</td><td>{entry.persons?.name}</td><td>{t(`customerCredits.${entry.kind}`)}</td>
      <td>{entry.reference}{entry.voidReference ? ` / ${entry.voidReference}` : ""}</td><td>{entry.creditId || "-"} / {entry.invoiceId || entry.transactionId || "-"}</td>
      <td>{money(entry.amount, entry.currencyId)}</td><td>{entry.voidedOn ? `${t("common.inactive")} (${entry.voidedOn})` : t("common.active")}</td>
      <td>{canVoidTransactions && !entry.voidedOn && <button className="button-link-secondary" disabled={busy} onClick={() => start("reverse", entry)}>{t("customerCredits.reverse")}</button>}</td>
    </tr>)}</tbody></table>

    {form && <div className="modal-backdrop"><div className="modal-card">
      <h3>{t(`customerCredits.${form.action}`)}</h3>
      {form.action === "opening" && <p>{t("customerCredits.openingHelp")}</p>}
      {error && <p className="error-text">{error}</p>}
      <form className="crud-form" onSubmit={submit}><div className="form-grid-2">
        <label className="field-block"><span>{t("transactions.person")}</span><select required disabled={Boolean(form.creditId)} value={form.personId} onChange={(e) => setForm((prev) => ({ ...prev, personId: e.target.value, invoiceId: "" }))}>
          <option value="">--</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label className="field-block"><span>{t("transactions.currency")}</span><select required disabled={Boolean(form.creditId)} value={form.currencyId} onChange={(e) => setForm((prev) => ({ ...prev, currencyId: e.target.value, invoiceId: "" }))}>
          <option value="">--</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="field-block"><span>{t("transactions.date")}</span><input type="date" required max={today()} value={form.date} onChange={(e) => change("date", e.target.value)} /></label>
        {form.action !== "reverse" && <label className="field-block"><span>{t("transactions.amount")}</span><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => change("amount", e.target.value)} /></label>}
        {selectedCredit && <ReadOnlyField label={t("customerCredits.available")} value={money(selectedCredit.available, selectedCredit.currencyId)} />}
        {["application","receive"].includes(form.action) && <label className="field-block"><span>{t("customerCredits.invoice")}</span>
          <select required={form.action === "application"} value={form.invoiceId} onChange={(e) => change("invoiceId", e.target.value)}>
            <option value="">--</option>{invoices.filter((tx) => String(tx.personId) === form.personId && String(tx.currencyId) === form.currencyId).map((tx) =>
              <option key={tx.id} value={tx.id}>#{tx.id} {tx.referenceNumber} ({money(tx.balance, tx.currencyId)})</option>)}
          </select></label>}
        {form.action === "receive" && <>
          <ReadOnlyField label={t("customerCredits.appliedToInvoice")} value={money(receiptApplied, form.currencyId)} />
          <ReadOnlyField label={t("customerCredits.excess")} value={money(Math.max((Number(form.amount) || 0) - receiptApplied, 0), form.currencyId)} />
        </>}
        {cashOperation && <>
          <label className="field-block"><span>{t("transactions.paymentMethod")}</span><select required value={form.paymentMethodId} onChange={(e) => change("paymentMethodId", e.target.value)}>
            <option value="">--</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>
          <label className="field-block"><span>{t("transactions.accountPaymentForm")}</span><select required value={form.accountPaymentFormId} onChange={(e) => change("accountPaymentFormId", e.target.value)}>
            <option value="">--</option>{forms.filter((f) => f.kind === "bank_account" || f.kind === "cashbox").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></label>
        </>}
        <label className="field-block form-span-2"><span>{t("transactions.referenceNumber")}</span><input required value={form.reference} onChange={(e) => change("reference", e.target.value)} /></label>
      </div><div className="crud-form-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => setForm(null)}>{t("common.cancel")}</button>
        <button type="submit" disabled={busy}>{t("common.save")}</button>
      </div></form>
    </div></div>}
  </div>;
}
