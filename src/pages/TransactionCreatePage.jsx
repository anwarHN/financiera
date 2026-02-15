import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listCurrencies } from "../services/currenciesService";
import { listEmployees } from "../services/employeesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { listPersons } from "../services/personsService";
import { createTransactionWithDetails, TRANSACTION_TYPES } from "../services/transactionsService";

const moduleConfig = {
  sale: {
    type: TRANSACTION_TYPES.sale,
    titleKey: "transactions.salesCreateTitle",
    personFilter: 1,
    conceptFilter: (item) => Boolean(item.isProduct),
    backPath: "/sales"
  },
  purchase: {
    type: TRANSACTION_TYPES.purchase,
    titleKey: "transactions.purchasesCreateTitle",
    personFilter: 2,
    conceptFilter: (item) => Boolean(item.isAccountPayableConcept),
    backPath: "/purchases"
  },
  expense: {
    type: TRANSACTION_TYPES.expense,
    titleKey: "transactions.expensesCreateTitle",
    personFilter: 2,
    conceptFilter: (item) => Boolean(item.isExpense) && !Boolean(item.isOutgoingPaymentConcept),
    backPath: "/expenses"
  },
  income: {
    type: TRANSACTION_TYPES.income,
    titleKey: "transactions.incomesCreateTitle",
    personFilter: null,
    conceptFilter: (item) => Boolean(item.isIncome) && !Boolean(item.isProduct) && !Boolean(item.isIncomingPaymentConcept),
    backPath: "/incomes"
  }
};

const initialSimpleForm = {
  date: new Date().toISOString().slice(0, 10),
  personId: "",
  conceptId: "",
  description: "",
  amount: 0,
  additionalCharges: 0,
  currencyId: "",
  referenceNumber: "",
  paymentMode: "cash",
  paymentMethodId: "",
  accountPaymentFormId: ""
};

const initialSaleHeader = {
  date: new Date().toISOString().slice(0, 10),
  paymentMode: "cash",
  description: "",
  currencyId: "",
  referenceNumber: "",
  paymentMethodId: "",
  accountPaymentFormId: ""
};

function calculateLineAmounts(line) {
  const quantity = Number(line.quantity) || 0;
  const price = Number(line.price) || 0;
  const taxPercentage = Number(line.taxPercentage) || 0;
  const discountPercentage = Number(line.discountPercentage) || 0;
  const additionalCharges = Number(line.additionalCharges) || 0;

  const net = quantity * price;
  const tax = net * (taxPercentage / 100);
  const discount = net * (discountPercentage / 100);
  const total = net + tax - discount + additionalCharges;

  return { net, tax, discount, total, quantity, price, taxPercentage, discountPercentage, additionalCharges };
}

function aggregateLines(lines) {
  return lines.reduce(
    (acc, line) => {
      const amounts = calculateLineAmounts(line);
      acc.net += amounts.net;
      acc.tax += amounts.tax;
      acc.discount += amounts.discount;
      acc.additionalCharges += amounts.additionalCharges;
      acc.total += amounts.total;
      return acc;
    },
    { net: 0, tax: 0, discount: 0, additionalCharges: 0, total: 0 }
  );
}

function TransactionCreatePage({ moduleType }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const config = moduleConfig[moduleType];

  const [persons, setPersons] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [accountPaymentForms, setAccountPaymentForms] = useState([]);

  const [simpleForm, setSimpleForm] = useState(initialSimpleForm);
  const [saleHeader, setSaleHeader] = useState(initialSaleHeader);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientLookup, setClientLookup] = useState("");
  const [productLookup, setProductLookup] = useState("");
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [saleLines, setSaleLines] = useState([]);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const conceptOptions = useMemo(() => concepts.filter(config.conceptFilter), [concepts, config.conceptFilter]);
  const personOptions = useMemo(() => {
    if (!config.personFilter) return persons;
    return persons.filter((item) => item.type === config.personFilter);
  }, [persons, config.personFilter]);

  const selectedSimplePaymentMethod = useMemo(
    () => paymentMethods.find((item) => item.id === Number(simpleForm.paymentMethodId)) ?? null,
    [paymentMethods, simpleForm.paymentMethodId]
  );
  const selectedSalePaymentMethod = useMemo(
    () => paymentMethods.find((item) => item.id === Number(saleHeader.paymentMethodId)) ?? null,
    [paymentMethods, saleHeader.paymentMethodId]
  );
  const localCurrencyId = useMemo(() => currencies.find((currency) => currency.isLocal)?.id ?? "", [currencies]);
  const simpleFilteredAccountPaymentForms = useMemo(() => {
    if (!selectedSimplePaymentMethod) return accountPaymentForms;
    if (selectedSimplePaymentMethod.code === "card") return accountPaymentForms.filter((item) => item.kind === "credit_card");
    if (selectedSimplePaymentMethod.code === "bank_transfer") return accountPaymentForms.filter((item) => item.kind === "bank_account");
    if (selectedSimplePaymentMethod.code === "cash") return accountPaymentForms.filter((item) => item.kind === "cashbox");
    return accountPaymentForms;
  }, [accountPaymentForms, selectedSimplePaymentMethod]);
  const saleFilteredAccountPaymentForms = useMemo(() => {
    if (!selectedSalePaymentMethod) return accountPaymentForms;
    if (selectedSalePaymentMethod.code === "card") return accountPaymentForms.filter((item) => item.kind === "credit_card");
    if (selectedSalePaymentMethod.code === "bank_transfer") return accountPaymentForms.filter((item) => item.kind === "bank_account");
    if (selectedSalePaymentMethod.code === "cash") return accountPaymentForms.filter((item) => item.kind === "cashbox");
    return accountPaymentForms;
  }, [accountPaymentForms, selectedSalePaymentMethod]);

  const simpleRequiresAccountPaymentForm = useMemo(() => {
    const asksPayment = moduleType === "income" || moduleType === "expense";
    const purchaseCash = moduleType === "purchase" && simpleForm.paymentMode === "cash";
    if (!asksPayment && !purchaseCash) return false;
    return selectedSimplePaymentMethod?.code === "card" || selectedSimplePaymentMethod?.code === "bank_transfer";
  }, [moduleType, simpleForm.paymentMode, selectedSimplePaymentMethod]);

  const saleRequiresAccountPaymentForm = useMemo(() => {
    if (saleHeader.paymentMode !== "cash") return false;
    return selectedSalePaymentMethod?.code === "card" || selectedSalePaymentMethod?.code === "bank_transfer";
  }, [saleHeader.paymentMode, selectedSalePaymentMethod]);

  const clientMatches = useMemo(() => {
    if (moduleType !== "sale" || !clientLookup.trim()) return [];
    const query = clientLookup.toLowerCase();
    return personOptions.filter((person) => person.name.toLowerCase().includes(query)).slice(0, 8);
  }, [moduleType, clientLookup, personOptions]);

  const productMatches = useMemo(() => {
    if (moduleType !== "sale" || !productLookup.trim()) return [];
    const query = productLookup.toLowerCase();
    return conceptOptions.filter((concept) => concept.name.toLowerCase().includes(query)).slice(0, 8);
  }, [moduleType, productLookup, conceptOptions]);

  const saleTotals = useMemo(() => aggregateLines(saleLines), [saleLines]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId, config.type]);

  useEffect(() => {
    if (!localCurrencyId) return;
    setSimpleForm((prev) => ({ ...prev, currencyId: prev.currencyId || String(localCurrencyId) }));
    setSaleHeader((prev) => ({ ...prev, currencyId: prev.currencyId || String(localCurrencyId) }));
  }, [localCurrencyId]);

  const loadDependencies = async () => {
    try {
      setIsLoading(true);
      const [personsRes, conceptsRes, employeesRes, currenciesRes, paymentMethodsRes, accountPaymentFormsRes] = await Promise.allSettled([
        listPersons(account.accountId),
        listConcepts(account.accountId),
        listEmployees(account.accountId),
        listCurrencies(account.accountId),
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId)
      ]);

      setPersons(personsRes.status === "fulfilled" ? personsRes.value : []);
      setConcepts(conceptsRes.status === "fulfilled" ? conceptsRes.value : []);
      setEmployees(employeesRes.status === "fulfilled" ? employeesRes.value : []);
      setCurrencies(currenciesRes.status === "fulfilled" ? currenciesRes.value : []);
      setPaymentMethods(paymentMethodsRes.status === "fulfilled" ? paymentMethodsRes.value : []);
      setAccountPaymentForms(accountPaymentFormsRes.status === "fulfilled" ? accountPaymentFormsRes.value : []);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimpleChange = (event) => {
    const { name, value } = event.target;
    if (name === "paymentMode" && value === "credit") {
      setSimpleForm((prev) => ({
        ...prev,
        paymentMode: value,
        paymentMethodId: "",
        accountPaymentFormId: ""
      }));
      return;
    }
    if (name === "conceptId") {
      const selectedConcept = conceptOptions.find((concept) => concept.id === Number(value));
      setSimpleForm((prev) => ({
        ...prev,
        conceptId: value,
        additionalCharges: selectedConcept?.additionalCharges ?? prev.additionalCharges
      }));
      return;
    }
    if (name === "paymentMethodId") {
      setSimpleForm((prev) => ({ ...prev, paymentMethodId: value, accountPaymentFormId: "" }));
      return;
    }
    setSimpleForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaleHeaderChange = (event) => {
    const { name, value } = event.target;
    if (name === "paymentMode" && value === "credit") {
      setSaleHeader((prev) => ({
        ...prev,
        paymentMode: value,
        paymentMethodId: "",
        accountPaymentFormId: ""
      }));
      return;
    }
    if (name === "paymentMethodId") {
      setSaleHeader((prev) => ({ ...prev, paymentMethodId: value, accountPaymentFormId: "" }));
      return;
    }
    setSaleHeader((prev) => ({ ...prev, [name]: value }));
  };

  const addSaleLine = (concept) => {
    setSaleLines((prev) => [
      ...prev,
      {
        rowId: `${concept.id}-${Date.now()}-${Math.random()}`,
        conceptId: concept.id,
        conceptName: concept.name,
        quantity: 1,
        price: Number(concept.price) || 0,
        taxPercentage: Number(concept.taxPercentage) || 0,
        discountPercentage: 0,
        additionalCharges: Number(concept.additionalCharges) || 0,
        sellerId: ""
      }
    ]);
    setProductLookup("");
    setShowProductSuggestions(false);
  };

  const updateSaleLine = (rowId, field, value) => {
    setSaleLines((prev) => prev.map((line) => (line.rowId === rowId ? { ...line, [field]: value } : line)));
  };

  const removeSaleLine = (rowId) => {
    setSaleLines((prev) => prev.filter((line) => line.rowId !== rowId));
  };

  const buildTransactionPayload = ({
    isCredit,
    personId,
    description,
    date,
    totals,
    currencyId,
    referenceNumber,
    paymentMethodId,
    accountPaymentFormId,
    incomingPayment = false
  }) => ({
    accountId: account.accountId,
    personId: personId || null,
    date,
    type: config.type,
    name: description?.trim() || null,
    referenceNumber: referenceNumber?.trim() || null,
    deliverTo: null,
    deliveryAddress: null,
    status: 1,
    createdById: user.id,
    net: totals.net,
    discounts: totals.discount,
    taxes: totals.tax,
    additionalCharges: totals.additionalCharges,
    total: totals.total,
    isAccountPayable: moduleType === "purchase" ? isCredit : false,
    isAccountReceivable: moduleType === "sale" ? isCredit : false,
    isIncomingPayment: incomingPayment,
    isOutcomingPayment: false,
    balance: isCredit ? totals.total : 0,
    payments: isCredit ? 0 : totals.total,
    isActive: true,
    currencyId: currencyId ? Number(currencyId) : null,
    paymentMethodId: paymentMethodId ? Number(paymentMethodId) : null,
    accountPaymentFormId: accountPaymentFormId ? Number(accountPaymentFormId) : null
  });

  const handleSubmitSimple = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !user?.id || !simpleForm.conceptId || !simpleForm.currencyId) return;

    const purchaseCash = moduleType === "purchase" && simpleForm.paymentMode === "cash";
    const needsPaymentMethod = moduleType === "income" || moduleType === "expense" || purchaseCash;
    if (needsPaymentMethod && !simpleForm.paymentMethodId) {
      setError(t("transactions.paymentMethodRequired"));
      return;
    }
    if (simpleRequiresAccountPaymentForm && !simpleForm.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const baseAmountRaw = Number(simpleForm.amount) || 0;
    const additionalChargesRaw = Number(simpleForm.additionalCharges) || 0;
    const isExpenseFlow = moduleType === "expense";
    const baseAmount = isExpenseFlow ? -Math.abs(baseAmountRaw) : baseAmountRaw;
    const additionalCharges = isExpenseFlow ? -Math.abs(additionalChargesRaw) : additionalChargesRaw;
    const totalAmount = baseAmount + additionalCharges;
    const isCredit = moduleType === "purchase" ? simpleForm.paymentMode === "credit" : false;
    const shouldPersistPayment = moduleType !== "purchase" || simpleForm.paymentMode === "cash";

    const transactionPayload = buildTransactionPayload({
      isCredit,
      personId: simpleForm.personId ? Number(simpleForm.personId) : null,
      description: simpleForm.description,
      date: simpleForm.date,
      totals: { net: baseAmount, tax: 0, discount: 0, additionalCharges, total: totalAmount },
      currencyId: simpleForm.currencyId,
      referenceNumber: simpleForm.referenceNumber,
      paymentMethodId: shouldPersistPayment ? simpleForm.paymentMethodId : null,
      accountPaymentFormId: shouldPersistPayment ? simpleForm.accountPaymentFormId : null,
      incomingPayment: moduleType === "income"
    });

    const detailPayload = {
      conceptId: Number(simpleForm.conceptId),
      quantity: 1,
      price: baseAmount,
      net: baseAmount,
      taxPercentage: 0,
      tax: 0,
      discountPercentage: 0,
      discount: 0,
      total: totalAmount,
      additionalCharges,
      createdById: user.id,
      sellerId: null,
      transactionPaidId: null
    };

    try {
      setIsSaving(true);
      await createTransactionWithDetails({ transaction: transactionPayload, details: [detailPayload] });
      navigate(config.backPath);
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSale = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !user?.id || !selectedClient || saleLines.length === 0 || !saleHeader.currencyId) {
      setError(t("transactions.saleValidationError"));
      return;
    }

    const isCredit = saleHeader.paymentMode === "credit";
    if (!isCredit && !saleHeader.paymentMethodId) {
      setError(t("transactions.paymentMethodRequired"));
      return;
    }
    if (saleRequiresAccountPaymentForm && !saleHeader.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const transactionPayload = buildTransactionPayload({
      isCredit,
      personId: selectedClient.id,
      description: saleHeader.description,
      date: saleHeader.date,
      totals: saleTotals,
      currencyId: saleHeader.currencyId,
      referenceNumber: saleHeader.referenceNumber,
      paymentMethodId: isCredit ? null : saleHeader.paymentMethodId,
      accountPaymentFormId: isCredit ? null : saleHeader.accountPaymentFormId,
      incomingPayment: false
    });

    const detailPayloads = saleLines.map((line) => {
      const amounts = calculateLineAmounts(line);
      return {
        conceptId: Number(line.conceptId),
        quantity: amounts.quantity,
        price: amounts.price,
        net: amounts.net,
        taxPercentage: amounts.taxPercentage,
        tax: amounts.tax,
        discountPercentage: amounts.discountPercentage,
        discount: amounts.discount,
        total: amounts.total,
        additionalCharges: amounts.additionalCharges,
        createdById: user.id,
        sellerId: line.sellerId ? Number(line.sellerId) : null,
        transactionPaidId: null
      };
    });

    try {
      setIsSaving(true);
      await createTransactionWithDetails({ transaction: transactionPayload, details: detailPayloads });
      navigate(config.backPath);
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
        <h1>{t(config.titleKey)}</h1>
        <Link to={config.backPath} className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>

      {error && <p className="error-text">{error}</p>}

      {moduleType !== "sale" ? (
        <form className="crud-form" onSubmit={handleSubmitSimple}>
          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionGeneral")}</h2>
            <div className="form-grid-2">
              <label className="field-block">
                <span>{t("transactions.date")}</span>
                <input type="date" name="date" value={simpleForm.date} onChange={handleSimpleChange} required />
              </label>
              <label className="field-block">
                <span>{t("transactions.currency")}</span>
                <select name="currencyId" value={simpleForm.currencyId} onChange={handleSimpleChange} required>
                  <option value="">{t("transactions.selectCurrency")}</option>
                  {currencies.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.name} ({currency.symbol})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>{t("transactions.person")}</span>
                <select name="personId" value={simpleForm.personId} onChange={handleSimpleChange}>
                  <option value="">{t("transactions.optionalPerson")}</option>
                  {personOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>{t("transactions.concept")}</span>
                <select name="conceptId" value={simpleForm.conceptId} onChange={handleSimpleChange} required>
                  <option value="">{t("transactions.selectConcept")}</option>
                  {conceptOptions.map((concept) => (
                    <option key={concept.id} value={concept.id}>
                      {concept.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={simpleForm.description} onChange={handleSimpleChange} />
              </label>
              <label className="field-block">
                <span>{t("transactions.referenceNumber")}</span>
                <input name="referenceNumber" value={simpleForm.referenceNumber} onChange={handleSimpleChange} />
              </label>
            </div>
          </section>

          {(moduleType === "purchase" || moduleType === "income" || moduleType === "expense") && (
            <section className="crud-form-section">
              <h2 className="crud-form-section-title">{t("transactions.sectionPayment")}</h2>
              <div className="form-grid-2">
                {moduleType === "purchase" && (
                  <label className="field-block">
                    <span>{t("transactions.paymentMode")}</span>
                    <select name="paymentMode" value={simpleForm.paymentMode} onChange={handleSimpleChange}>
                      <option value="cash">{t("transactions.cash")}</option>
                      <option value="credit">{t("transactions.credit")}</option>
                    </select>
                  </label>
                )}
                {(moduleType !== "purchase" || simpleForm.paymentMode === "cash") && (
                  <>
                    <label className="field-block">
                      <span>{t("transactions.paymentMethod")}</span>
                      <select
                        name="paymentMethodId"
                        value={simpleForm.paymentMethodId}
                        onChange={handleSimpleChange}
                        required={moduleType !== "purchase" || simpleForm.paymentMode === "cash"}
                      >
                        <option value="">{t("transactions.selectPaymentMethod")}</option>
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
                        value={simpleForm.accountPaymentFormId}
                        onChange={handleSimpleChange}
                        required={simpleRequiresAccountPaymentForm}
                      >
                        <option value="">{t("transactions.selectAccountPaymentForm")}</option>
                        {simpleFilteredAccountPaymentForms.map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionAmounts")}</h2>
            <div className="form-grid-2">
            <label className="field-block">
              <span>{t("transactions.amount")}</span>
              <input name="amount" type="number" min="0" step="0.01" value={simpleForm.amount} onChange={handleSimpleChange} required />
            </label>
            <label className="field-block">
              <span>{t("transactions.additionalCharges")}</span>
              <input name="additionalCharges" type="number" step="0.01" value={simpleForm.additionalCharges} readOnly />
            </label>
            </div>
          </section>

          <p>
            {t("transactions.summary")} {(Number(simpleForm.amount || 0) + Number(simpleForm.additionalCharges || 0)).toFixed(2)}
          </p>

          <div className="crud-form-actions">
            <button type="submit" disabled={isSaving}>
              {t("common.create")}
            </button>
          </div>
        </form>
      ) : (
        <form className="crud-form" onSubmit={handleSubmitSale}>
          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionGeneral")}</h2>
            <div className="form-grid-2">
              <label className="field-block">
                <span>{t("transactions.date")}</span>
                <input type="date" name="date" value={saleHeader.date} onChange={handleSaleHeaderChange} required />
              </label>
              <label className="field-block">
                <span>{t("transactions.currency")}</span>
                <select name="currencyId" value={saleHeader.currencyId} onChange={handleSaleHeaderChange} required>
                  <option value="">{t("transactions.selectCurrency")}</option>
                  {currencies.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.name} ({currency.symbol})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>{t("transactions.paymentMode")}</span>
                <select name="paymentMode" value={saleHeader.paymentMode} onChange={handleSaleHeaderChange}>
                  <option value="cash">{t("transactions.cash")}</option>
                  <option value="credit">{t("transactions.credit")}</option>
                </select>
              </label>
              <div className="lookup-wrap">
                <label>{t("transactions.clientLookup")}</label>
                <input
                  value={clientLookup}
                  onChange={(event) => {
                    setClientLookup(event.target.value);
                    setShowClientSuggestions(true);
                    if (!event.target.value) setSelectedClient(null);
                  }}
                  onFocus={() => setShowClientSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowClientSuggestions(false), 120)}
                  placeholder={t("transactions.lookupPlaceholder")}
                />
                {showClientSuggestions && clientMatches.length > 0 && (
                  <div className="lookup-results">
                    {clientMatches.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className="lookup-item"
                        onClick={() => {
                          setSelectedClient(client);
                          setClientLookup(client.name);
                          setShowClientSuggestions(false);
                        }}
                      >
                        {client.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={saleHeader.description} onChange={handleSaleHeaderChange} />
              </label>
              <label className="field-block">
                <span>{t("transactions.referenceNumber")}</span>
                <input name="referenceNumber" value={saleHeader.referenceNumber} onChange={handleSaleHeaderChange} />
              </label>
            </div>
          </section>

          {saleHeader.paymentMode === "cash" && (
            <section className="crud-form-section">
              <h2 className="crud-form-section-title">{t("transactions.sectionPayment")}</h2>
              <div className="form-grid-2">
                <label className="field-block">
                  <span>{t("transactions.paymentMethod")}</span>
                  <select name="paymentMethodId" value={saleHeader.paymentMethodId} onChange={handleSaleHeaderChange} required>
                    <option value="">{t("transactions.selectPaymentMethod")}</option>
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
                    value={saleHeader.accountPaymentFormId}
                    onChange={handleSaleHeaderChange}
                    required={saleRequiresAccountPaymentForm}
                  >
                    <option value="">{t("transactions.selectAccountPaymentForm")}</option>
                    {saleFilteredAccountPaymentForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionDetail")}</h2>
            <div className="lookup-wrap">
              <label>{t("transactions.productLookup")}</label>
              <input
                value={productLookup}
                onChange={(event) => {
                  setProductLookup(event.target.value);
                  setShowProductSuggestions(true);
                }}
                onFocus={() => setShowProductSuggestions(true)}
                onBlur={() => setTimeout(() => setShowProductSuggestions(false), 120)}
                placeholder={t("transactions.productLookupPlaceholder")}
              />
              {showProductSuggestions && productMatches.length > 0 && (
                <div className="lookup-results">
                  {productMatches.map((product) => (
                    <button key={product.id} type="button" className="lookup-item" onClick={() => addSaleLine(product)}>
                      {product.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <table className="crud-table invoice-lines-table">
            <thead>
              <tr>
                <th>{t("transactions.product")}</th>
                <th>{t("transactions.quantity")}</th>
                <th>{t("transactions.price")}</th>
                <th>{t("transactions.taxPercentage")}</th>
                <th>{t("transactions.discountPercentage")}</th>
                <th>{t("transactions.additionalCharges")}</th>
                <th>{t("transactions.lineTotal")}</th>
                <th>{t("transactions.seller")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {saleLines.length === 0 ? (
                <tr>
                  <td colSpan={9}>{t("transactions.noLines")}</td>
                </tr>
              ) : (
                saleLines.map((line) => {
                  const lineAmounts = calculateLineAmounts(line);
                  return (
                    <tr key={line.rowId}>
                      <td>{line.conceptName}</td>
                      <td>
                        <input type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateSaleLine(line.rowId, "quantity", event.target.value)} />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.01" value={line.price} onChange={(event) => updateSaleLine(line.rowId, "price", event.target.value)} />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.taxPercentage}
                          onChange={(event) => updateSaleLine(line.rowId, "taxPercentage", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discountPercentage}
                          onChange={(event) => updateSaleLine(line.rowId, "discountPercentage", event.target.value)}
                        />
                      </td>
                      <td>
                        <input type="number" value={line.additionalCharges} readOnly />
                      </td>
                      <td>{lineAmounts.total.toFixed(2)}</td>
                      <td>
                        <select value={line.sellerId} onChange={(event) => updateSaleLine(line.rowId, "sellerId", event.target.value)}>
                          <option value="">{t("transactions.optionalSeller")}</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="button-danger" onClick={() => removeSaleLine(line.rowId)}>
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <p>
            {t("transactions.summary")} {saleTotals.total.toFixed(2)}
          </p>

          <div className="crud-form-actions">
            <button type="submit" disabled={isSaving}>
              {t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default TransactionCreatePage;
