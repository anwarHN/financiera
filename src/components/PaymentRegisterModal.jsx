import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { registerPaymentForTransaction, TRANSACTION_TYPES } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  description: "",
  referenceNumber: "",
  paymentMethodId: "",
  accountPaymentFormId: ""
};

function PaymentRegisterModal({ isOpen, onClose, transaction, direction, onSaved }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [accountPaymentForms, setAccountPaymentForms] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [error, setError] = useState("");
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

  useEffect(() => {
    if (!isOpen || !account?.accountId) return;
    loadData();
    setForm((prev) => ({ ...prev, amount: Number(transaction?.balance || 0) }));
  }, [isOpen, account?.accountId, transaction?.id]);

  const loadData = async () => {
    try {
      const [methods, forms, conceptData] = await Promise.all([
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId),
        listConcepts(account.accountId)
      ]);
      setPaymentMethods(methods);
      setAccountPaymentForms(forms);
      setConcepts(conceptData);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  if (!isOpen || !transaction) return null;

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
    if (!account?.accountId || !user?.id) return;
    if (!form.paymentMethodId) {
      setError(t("transactions.paymentMethodRequired"));
      return;
    }
    if (requiresAccountPaymentForm && !form.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const amount = Number(form.amount || 0);
    if (amount <= 0 || amount > Number(transaction.balance || 0)) {
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

    const paymentTransaction = {
      accountId: account.accountId,
      personId: transaction.personId,
      date: form.date,
      type: direction === "incoming" ? TRANSACTION_TYPES.incomingPayment : TRANSACTION_TYPES.outgoingPayment,
      name: form.description?.trim() || null,
      referenceNumber: form.referenceNumber?.trim() || null,
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
      currencyId: transaction.currencyId ?? null,
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
        paidTransaction: transaction,
        paymentTransaction,
        paymentDetail
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h3>{direction === "incoming" ? t("transactions.newIncomingPayment") : t("transactions.newOutgoingPayment")}</h3>
        {error && <p className="error-text">{error}</p>}
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <label className="field-block">
              <span>{t("transactions.date")}</span>
              <input type="date" name="date" value={form.date} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("transactions.amount")}</span>
              <input type="number" min="0" step="0.01" name="amount" value={form.amount} onChange={handleChange} required />
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
            <label className="field-block">
              <span>{t("transactions.referenceNumber")}</span>
              <input name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
            </label>
            <label className="field-block form-span-2">
              <span>{t("transactions.description")}</span>
              <input name="description" value={form.description} onChange={handleChange} />
            </label>
          </div>
          <div className="crud-form-actions">
            <button type="button" className="button-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isSaving}>
              {t("common.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentRegisterModal;
