import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { getTransactionById, registerPaymentForTransaction, TRANSACTION_TYPES } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  description: "",
  paymentMethodId: "",
  accountPaymentFormId: ""
};

function TransactionPaymentPage({ direction }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [paidTransaction, setPaidTransaction] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [accountPaymentForms, setAccountPaymentForms] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === Number(form.paymentMethodId)) ?? null,
    [paymentMethods, form.paymentMethodId]
  );
  const requiresAccountPaymentForm = selectedPaymentMethod?.code === "card" || selectedPaymentMethod?.code === "bank_transfer";
  const filteredAccountPaymentForms = useMemo(() => {
    if (!selectedPaymentMethod) return accountPaymentForms;
    if (selectedPaymentMethod.code === "card") return accountPaymentForms.filter((item) => item.kind === "credit_card");
    if (selectedPaymentMethod.code === "bank_transfer") return accountPaymentForms.filter((item) => item.kind === "bank_account");
    if (selectedPaymentMethod.code === "cash") return accountPaymentForms.filter((item) => item.kind === "cashbox");
    return accountPaymentForms;
  }, [accountPaymentForms, selectedPaymentMethod]);
  const backPath = direction === "incoming" ? `/sales/${id}` : `/purchases/${id}`;

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId, id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [tx, methods, forms, conceptData] = await Promise.all([
        getTransactionById(id),
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId),
        listConcepts(account.accountId)
      ]);
      setPaidTransaction(tx);
      setPaymentMethods(methods);
      setAccountPaymentForms(forms);
      setConcepts(conceptData);
      setForm((prev) => ({ ...prev, amount: Number(tx.balance || 0) }));
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "paymentMethodId") {
      setForm((prev) => ({ ...prev, paymentMethodId: value, accountPaymentFormId: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !user?.id || !paidTransaction) return;
    if (!form.paymentMethodId) {
      setError(t("transactions.paymentMethodRequired"));
      return;
    }
    if (requiresAccountPaymentForm && !form.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const amount = Number(form.amount || 0);
    if (amount <= 0 || amount > Number(paidTransaction.balance || 0)) {
      setError(t("transactions.invalidPaymentAmount"));
      return;
    }

    const paymentConcept = concepts.find((item) =>
      direction === "incoming" ? item.isIncomingPaymentConcept : item.isOutgoingPaymentConcept
    );
    if (!paymentConcept) {
      setError(t("transactions.missingSystemPaymentConcept"));
      return;
    }

    const paymentType = direction === "incoming" ? TRANSACTION_TYPES.incomingPayment : TRANSACTION_TYPES.outgoingPayment;
    const paymentTransaction = {
      accountId: account.accountId,
      personId: paidTransaction.personId,
      date: form.date,
      type: paymentType,
      name: form.description?.trim() || null,
      deliverTo: null,
      deliveryAddress: null,
      status: 1,
      createdById: user.id,
      net: amount,
      discounts: 0,
      taxes: 0,
      additionalCharges: 0,
      total: amount,
      isAccountPayable: false,
      isAccountReceivable: false,
      isIncomingPayment: direction === "incoming",
      isOutcomingPayment: direction === "outgoing",
      balance: 0,
      payments: amount,
      isActive: true,
      currencyId: paidTransaction.currencyId ?? null,
      paymentMethodId: Number(form.paymentMethodId),
      accountPaymentFormId: form.accountPaymentFormId ? Number(form.accountPaymentFormId) : null
    };

    const paymentDetail = {
      conceptId: paymentConcept.id,
      quantity: 1,
      price: amount,
      net: amount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: amount,
      additionalCharges: 0,
      createdById: user.id,
      sellerId: null
    };

    try {
      setIsSaving(true);
      await registerPaymentForTransaction({
        paidTransaction,
        paymentTransaction,
        paymentDetail
      });
      navigate(backPath);
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>{t("common.loading")}</p>;

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{direction === "incoming" ? t("transactions.newIncomingPayment") : t("transactions.newOutgoingPayment")}</h1>
        <Link to={backPath} className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>
      {error && <p className="error-text">{error}</p>}
      <form className="crud-form" onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <label className="field-block">
            <span>{t("transactions.date")}</span>
            <input type="date" name="date" value={form.date} onChange={handleChange} required />
          </label>
          <label className="field-block">
            <span>{t("transactions.amount")}</span>
            <input type="number" name="amount" value={form.amount} min="0" step="0.01" onChange={handleChange} required />
          </label>
          <label className="field-block">
            <span>{t("transactions.paymentMethod")}</span>
            <select name="paymentMethodId" value={form.paymentMethodId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectPaymentMethod")} --`}</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("transactions.accountPaymentForm")}</span>
            <select
              name="accountPaymentFormId"
              value={form.accountPaymentFormId}
              onChange={handleChange}
              required={requiresAccountPaymentForm}
            >
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {filteredAccountPaymentForms.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatPaymentFormLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block form-span-2">
            <span>{t("transactions.description")}</span>
            <input name="description" value={form.description} onChange={handleChange} />
          </label>
        </div>
        <div className="crud-form-actions">
          <button type="submit" disabled={isSaving}>
            {t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default TransactionPaymentPage;
