import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LookupCombobox from "../components/LookupCombobox";
import AccountPaymentFormPage from "./AccountPaymentFormPage";
import ConceptModuleFormPage from "./ConceptModuleFormPage";
import EmployeeFormPage from "./EmployeeFormPage";
import PeopleFormPage from "./PeopleFormPage";
import ProjectFormPage from "./ProjectFormPage";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listCurrencies } from "../services/currenciesService";
import { listEmployees } from "../services/employeesService";
import { createPaymentMethod, listPaymentMethods } from "../services/paymentMethodsService";
import { listPersons } from "../services/personsService";
import { listProjects } from "../services/projectsService";
import {
  createTransactionWithDetails,
  getTransactionById,
  listTransactionDetails,
  TRANSACTION_TYPES,
  updateTransactionWithDetails
} from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

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
    conceptFilter: (item) => Boolean(item.isExpense) && !Boolean(item.isGroup) && !Boolean(item.isOutgoingPaymentConcept),
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
  accountPaymentFormId: "",
  projectId: "",
  employeeId: ""
};

const initialSaleHeader = {
  date: new Date().toISOString().slice(0, 10),
  paymentMode: "cash",
  description: "",
  currencyId: "",
  referenceNumber: "",
  paymentMethodId: "",
  accountPaymentFormId: "",
  projectId: ""
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

function PaymentMethodQuickCreate({ t, accountId, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!accountId || !name.trim()) {
      setError(t("common.requiredFields"));
      return;
    }
    const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const code = `custom_${normalized || "method"}_${Date.now()}`;
    try {
      setIsSaving(true);
      const created = await createPaymentMethod({
        accountId,
        code,
        name: name.trim(),
        is_active: true,
        isSystem: false
      });
      onCreated?.(created);
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="crud-form" onSubmit={handleSubmit}>
      <h3>{t("transactions.paymentMethod")}</h3>
      {error ? <p className="error-text">{error}</p> : null}
      <label className="field-block">
        <span>{t("common.name")}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <div className="crud-form-actions">
        <button type="button" className="button-secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
          {t("common.create")}
        </button>
      </div>
    </form>
  );
}

function TransactionCreatePage({ moduleType, embedded = false, onCancel, onCreated, itemId = null }) {
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
  const [projects, setProjects] = useState([]);

  const [simpleForm, setSimpleForm] = useState(initialSimpleForm);
  const [saleHeader, setSaleHeader] = useState(initialSaleHeader);
  const [simplePersonLookup, setSimplePersonLookup] = useState("");
  const [simpleConceptLookup, setSimpleConceptLookup] = useState("");
  const [simplePaymentMethodLookup, setSimplePaymentMethodLookup] = useState("");
  const [simpleAccountFormLookup, setSimpleAccountFormLookup] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientLookup, setClientLookup] = useState("");
  const [simpleProjectLookup, setSimpleProjectLookup] = useState("");
  const [simpleEmployeeLookup, setSimpleEmployeeLookup] = useState("");
  const [saleProjectLookup, setSaleProjectLookup] = useState("");
  const [productLookup, setProductLookup] = useState("");
  const [saleLines, setSaleLines] = useState([]);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [simpleSubmitAttempted, setSimpleSubmitAttempted] = useState(false);
  const [saleSubmitAttempted, setSaleSubmitAttempted] = useState(false);
  const isEdit = Boolean(itemId);

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

  const saleTotals = useMemo(() => aggregateLines(saleLines), [saleLines]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId, config.type]);

  useEffect(() => {
    if (!account?.accountId || !itemId) return;
    loadEditableTransaction();
  }, [account?.accountId, itemId]);

  useEffect(() => {
    if (!localCurrencyId) return;
    setSimpleForm((prev) => ({ ...prev, currencyId: prev.currencyId || String(localCurrencyId) }));
    setSaleHeader((prev) => ({ ...prev, currencyId: prev.currencyId || String(localCurrencyId) }));
  }, [localCurrencyId]);

  const loadDependencies = async () => {
    try {
      setIsLoading(true);
      const [personsRes, conceptsRes, employeesRes, currenciesRes, paymentMethodsRes, accountPaymentFormsRes, projectsRes] = await Promise.allSettled([
        listPersons(account.accountId),
        listConcepts(account.accountId),
        listEmployees(account.accountId),
        listCurrencies(account.accountId),
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId),
        listProjects(account.accountId)
      ]);

      setPersons(personsRes.status === "fulfilled" ? personsRes.value : []);
      setConcepts(conceptsRes.status === "fulfilled" ? conceptsRes.value : []);
      setEmployees(employeesRes.status === "fulfilled" ? employeesRes.value : []);
      setCurrencies(currenciesRes.status === "fulfilled" ? currenciesRes.value : []);
      setPaymentMethods(paymentMethodsRes.status === "fulfilled" ? paymentMethodsRes.value : []);
      setAccountPaymentForms(accountPaymentFormsRes.status === "fulfilled" ? accountPaymentFormsRes.value : []);
      setProjects(projectsRes.status === "fulfilled" ? projectsRes.value : []);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatedPerson = async (created) => {
    try {
      const updatedPersons = await listPersons(account.accountId);
      setPersons(updatedPersons);
      if (moduleType === "sale") {
        setSelectedClient(created);
        setClientLookup("");
      } else {
        setSimpleForm((prev) => ({ ...prev, personId: String(created.id) }));
      }
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const handleCreatedConcept = async (created) => {
    try {
      const updatedConcepts = await listConcepts(account.accountId);
      setConcepts(updatedConcepts);
      setSimpleForm((prev) => ({
        ...prev,
        conceptId: String(created.id),
        additionalCharges: created.additionalCharges ?? prev.additionalCharges
      }));
      if (moduleType === "sale") {
        addSaleLine(created);
      }
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const handleCreatedProject = async (created) => {
    try {
      const updatedProjects = await listProjects(account.accountId);
      setProjects(updatedProjects);
      if (moduleType === "sale") {
        setSaleHeader((prev) => ({ ...prev, projectId: String(created.id) }));
        setSaleProjectLookup("");
      } else {
        setSimpleForm((prev) => ({ ...prev, projectId: String(created.id) }));
        setSimpleProjectLookup("");
      }
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const handleCreatedEmployee = async (created) => {
    try {
      const updatedEmployees = await listEmployees(account.accountId);
      setEmployees(updatedEmployees);
      setSimpleForm((prev) => ({ ...prev, employeeId: String(created.id) }));
      setSimpleEmployeeLookup("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const loadEditableTransaction = async () => {
    try {
      setIsLoading(true);
      const [tx, details] = await Promise.all([getTransactionById(itemId), listTransactionDetails(itemId)]);

      if (moduleType === "sale") {
        setSaleHeader({
          date: tx.date || initialSaleHeader.date,
          paymentMode: tx.isAccountReceivable ? "credit" : "cash",
          description: tx.name || "",
          currencyId: tx.currencyId ? String(tx.currencyId) : "",
          referenceNumber: tx.referenceNumber || "",
          paymentMethodId: tx.paymentMethodId ? String(tx.paymentMethodId) : "",
          accountPaymentFormId: tx.accountPaymentFormId ? String(tx.accountPaymentFormId) : "",
          projectId: tx.projectId ? String(tx.projectId) : ""
        });
        setSelectedClient(
          tx.personId
            ? {
                id: tx.personId,
                name: tx.persons?.name || ""
              }
            : null
        );
        setSaleLines(
          (details || []).map((line) => ({
            rowId: String(line.id || `${Date.now()}-${Math.random()}`),
            conceptId: Number(line.conceptId),
            conceptName: line.concepts?.name || "",
            quantity: Number(line.quantity) || 0,
            price: Number(line.price) || 0,
            taxPercentage: Number(line.taxPercentage) || 0,
            discountPercentage: Number(line.discountPercentage) || 0,
            additionalCharges: Number(line.additionalCharges) || 0,
            sellerId: line.sellerId ? String(line.sellerId) : ""
          }))
        );
      } else {
        const firstDetail = details?.[0] ?? null;
        const conceptId = firstDetail?.conceptId ? String(firstDetail.conceptId) : "";
        const amountValue = Number(firstDetail?.price || 0);
        const txAdditional = Number(firstDetail?.additionalCharges ?? tx.additionalCharges ?? 0);
        const isExpenseFlow = moduleType === "expense";

        setSimpleForm({
          date: tx.date || initialSimpleForm.date,
          personId: tx.personId ? String(tx.personId) : "",
          conceptId,
          description: tx.name || "",
          amount: isExpenseFlow ? Math.abs(amountValue) : amountValue,
          additionalCharges: isExpenseFlow ? Math.abs(txAdditional) : txAdditional,
          currencyId: tx.currencyId ? String(tx.currencyId) : "",
          referenceNumber: tx.referenceNumber || "",
          paymentMode: moduleType === "purchase" && tx.isAccountPayable ? "credit" : "cash",
          paymentMethodId: tx.paymentMethodId ? String(tx.paymentMethodId) : "",
          accountPaymentFormId: tx.accountPaymentFormId ? String(tx.accountPaymentFormId) : "",
          projectId: tx.projectId ? String(tx.projectId) : "",
          employeeId: tx.employeeId ? String(tx.employeeId) : ""
        });
      }
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
    projectId,
    employeeId,
    incomingPayment = false,
    includeCreatedById = true
  }) => {
    const parsedAccountPaymentFormId = accountPaymentFormId ? Number(accountPaymentFormId) : null;
    const shouldAutoReconcile = Boolean(parsedAccountPaymentFormId);

    return {
      accountId: account.accountId,
      personId: personId || null,
      date,
      type: config.type,
      name: description?.trim() || null,
      referenceNumber: referenceNumber?.trim() || null,
      deliverTo: null,
      deliveryAddress: null,
      status: 1,
      ...(includeCreatedById ? { createdById: user.id } : {}),
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
      projectId: projectId ? Number(projectId) : null,
      employeeId: employeeId ? Number(employeeId) : null,
      paymentMethodId: paymentMethodId ? Number(paymentMethodId) : null,
      accountPaymentFormId: parsedAccountPaymentFormId,
      isReconciled: shouldAutoReconcile,
      reconciledAt: shouldAutoReconcile ? date : null
    };
  };

  const handleSubmitSimple = async (event) => {
    event.preventDefault();
    setSimpleSubmitAttempted(true);
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!account?.accountId || !user?.id || !simpleForm.conceptId || !simpleForm.currencyId) {
      setError(t("common.requiredFields"));
      return;
    }
    if (moduleType === "purchase" && !simpleForm.personId) {
      setError(t("transactions.providerRequired"));
      return;
    }

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
    if (Math.abs(baseAmountRaw) <= 0) {
      setError(t("transactions.invalidTransactionAmount"));
      return;
    }
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
      projectId: simpleForm.projectId,
      employeeId: moduleType === "income" || moduleType === "expense" ? simpleForm.employeeId : null,
      incomingPayment: moduleType === "income",
      includeCreatedById: !isEdit
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
      let saved;
      if (isEdit) {
        saved = await updateTransactionWithDetails({
          transactionId: Number(itemId),
          transaction: transactionPayload,
          details: [detailPayload]
        });
      } else {
        saved = await createTransactionWithDetails({ transaction: transactionPayload, details: [detailPayload] });
      }
      if (embedded) {
        onCreated?.(saved);
      } else {
        navigate(config.backPath);
      }
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSale = async (event) => {
    event.preventDefault();
    setSaleSubmitAttempted(true);
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
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
      projectId: saleHeader.projectId,
      incomingPayment: false,
      includeCreatedById: !isEdit
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
      let saved;
      if (isEdit) {
        saved = await updateTransactionWithDetails({
          transactionId: Number(itemId),
          transaction: transactionPayload,
          details: detailPayloads
        });
      } else {
        saved = await createTransactionWithDetails({ transaction: transactionPayload, details: detailPayloads });
      }
      if (embedded) {
        onCreated?.(saved);
      } else {
        navigate(config.backPath);
      }
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <p>{t("common.loading")}</p>;

  return (
    <div className={embedded ? "" : "module-page"}>
      {!embedded ? (
        <div className="page-header-row">
          <h1>{t(config.titleKey)}</h1>
          <Link to={config.backPath} className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t(config.titleKey)}</h3>
      )}

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
                  <option value="">{`-- ${t("transactions.selectCurrency")} --`}</option>
                  {currencies.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.name} ({currency.symbol})
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-block">
                <span>{t("transactions.person")}</span>
                {moduleType === "income" || moduleType === "expense" ? (
                  <LookupCombobox
                    label=""
                    value={simplePersonLookup}
                    onValueChange={setSimplePersonLookup}
                    options={personOptions}
                    getOptionLabel={(person) => person.name || ""}
                    onSelect={(person) => setSimpleForm((prev) => ({ ...prev, personId: String(person.id) }))}
                    placeholder={`-- ${moduleType === "expense" ? t("transactions.selectProvider") : t("transactions.optionalPerson")} --`}
                    noResultsText={t("common.empty")}
                    selectedPillText={personOptions.find((person) => person.id === Number(simpleForm.personId))?.name || ""}
                    onClearSelection={() => {
                      setSimpleForm((prev) => ({ ...prev, personId: "" }));
                      setSimplePersonLookup("");
                    }}
                    onCreateRecord={handleCreatedPerson}
                    renderCreateModal={({ isOpen, onClose, onCreated }) =>
                      isOpen ? (
                        <div className="modal-backdrop">
                          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                            <PeopleFormPage
                              embedded
                              personType={moduleType === "expense" ? 2 : 1}
                              titleKey={moduleType === "expense" ? "actions.newProvider" : "actions.newClient"}
                              basePath={moduleType === "expense" ? "/providers" : "/clients"}
                              onCancel={onClose}
                              onCreated={onCreated}
                            />
                          </div>
                        </div>
                      ) : null
                    }
                  />
                ) : (
                  <div className="field-select-with-action">
                    <select name="personId" value={simpleForm.personId} onChange={handleSimpleChange} required={moduleType === "purchase"}>
                      <option value="">
                        {moduleType === "purchase"
                          ? `-- ${t("transactions.selectProvider")} --`
                          : `-- ${t("transactions.optionalPerson")} --`}
                      </option>
                      {personOptions.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                    <Link to={moduleType === "purchase" ? "/providers/new" : "/clients/new"} className="button-secondary" title={t("actions.newPerson")}>
                      +
                    </Link>
                  </div>
                )}
              </div>
              <div className={`field-block required ${simpleSubmitAttempted && !simpleForm.conceptId ? "field-error" : ""}`}>
                <span>{t("transactions.concept")}</span>
                {moduleType === "income" || moduleType === "expense" ? (
                  <LookupCombobox
                    label=""
                    value={simpleConceptLookup}
                    onValueChange={setSimpleConceptLookup}
                    options={conceptOptions}
                    getOptionLabel={(concept) => concept.name || ""}
                    onSelect={(concept) =>
                      setSimpleForm((prev) => ({
                        ...prev,
                        conceptId: String(concept.id),
                        additionalCharges: concept.additionalCharges ?? prev.additionalCharges
                      }))
                    }
                    placeholder={`-- ${t("transactions.selectConcept")} --`}
                    noResultsText={t("common.empty")}
                    selectedPillText={conceptOptions.find((concept) => concept.id === Number(simpleForm.conceptId))?.name || ""}
                    onClearSelection={() => {
                      setSimpleForm((prev) => ({ ...prev, conceptId: "", additionalCharges: 0 }));
                      setSimpleConceptLookup("");
                    }}
                    onCreateRecord={handleCreatedConcept}
                    required
                    hasError={simpleSubmitAttempted && !simpleForm.conceptId}
                    renderCreateModal={({ isOpen, onClose, onCreated }) =>
                      isOpen ? (
                        <div className="modal-backdrop">
                          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                            <ConceptModuleFormPage
                              embedded
                              moduleType={moduleType === "expense" ? "expense" : "income"}
                              titleKey={moduleType === "expense" ? "actions.newExpenseConcept" : "actions.newIncomeConcept"}
                              basePath={moduleType === "expense" ? "/expense-concepts" : "/income-concepts"}
                              onCancel={onClose}
                              onCreated={onCreated}
                            />
                          </div>
                        </div>
                      ) : null
                    }
                  />
                ) : (
                  <div className="field-select-with-action">
                    <select name="conceptId" value={simpleForm.conceptId} onChange={handleSimpleChange} required>
                      <option value="">{`-- ${t("transactions.selectConcept")} --`}</option>
                      {conceptOptions.map((concept) => (
                        <option key={concept.id} value={concept.id}>
                          {concept.name}
                        </option>
                      ))}
                    </select>
                    <Link
                      to={
                        moduleType === "purchase"
                          ? "/expense-concepts/new"
                          : moduleType === "expense"
                            ? "/expense-concepts/new"
                            : "/income-concepts/new"
                      }
                      className="button-secondary"
                      title={t("actions.newConcept")}
                    >
                      +
                    </Link>
                  </div>
                )}
              </div>
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={simpleForm.description} onChange={handleSimpleChange} />
              </label>
              <label className="field-block">
                <span>{t("transactions.referenceNumber")}</span>
                <input name="referenceNumber" value={simpleForm.referenceNumber} onChange={handleSimpleChange} />
              </label>
              <LookupCombobox
                label={t("projects.project")}
                value={simpleProjectLookup}
                onValueChange={(nextValue) => {
                  setSimpleProjectLookup(nextValue);
                  if (!nextValue) {
                    setSimpleForm((prev) => ({ ...prev, projectId: "" }));
                  }
                }}
                options={projects}
                getOptionLabel={(project) => project.name || ""}
                onSelect={(project) => {
                  setSimpleProjectLookup("");
                  setSimpleForm((prev) => ({ ...prev, projectId: String(project.id) }));
                }}
                placeholder={`-- ${t("projects.optionalProject")} --`}
                onCreateRecord={handleCreatedProject}
                renderCreateModal={({ isOpen, onClose, onCreated }) =>
                  isOpen ? (
                    <div className="modal-backdrop">
                      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <ProjectFormPage embedded onCancel={onClose} onCreated={onCreated} />
                      </div>
                    </div>
                  ) : null
                }
                noResultsText={t("common.empty")}
                selectedPillText={
                  projects.find((project) => project.id === Number(simpleForm.projectId))?.name || ""
                }
                onClearSelection={() => {
                  setSimpleForm((prev) => ({ ...prev, projectId: "" }));
                  setSimpleProjectLookup("");
                }}
              />
              {(moduleType === "income" || moduleType === "expense") && (
                <LookupCombobox
                  label={t("transactions.employee")}
                  value={simpleEmployeeLookup}
                  onValueChange={(nextValue) => {
                    setSimpleEmployeeLookup(nextValue);
                    if (!nextValue) {
                      setSimpleForm((prev) => ({ ...prev, employeeId: "" }));
                    }
                  }}
                  options={employees}
                  getOptionLabel={(employee) => employee.name || ""}
                  onSelect={(employee) => {
                    setSimpleEmployeeLookup("");
                    setSimpleForm((prev) => ({ ...prev, employeeId: String(employee.id) }));
                  }}
                  placeholder={`-- ${t("transactions.optionalSeller")} --`}
                  noResultsText={t("common.empty")}
                  selectedPillText={employees.find((employee) => employee.id === Number(simpleForm.employeeId))?.name || ""}
                  onClearSelection={() => {
                    setSimpleForm((prev) => ({ ...prev, employeeId: "" }));
                    setSimpleEmployeeLookup("");
                  }}
                  onCreateRecord={handleCreatedEmployee}
                  renderCreateModal={({ isOpen, onClose, onCreated }) =>
                    isOpen ? (
                      <div className="modal-backdrop">
                        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                          <EmployeeFormPage embedded onCancel={onClose} onCreated={onCreated} />
                        </div>
                      </div>
                    ) : null
                  }
                />
              )}
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
                    <div className="field-block required">
                      <span>{t("transactions.paymentMethod")}</span>
                      {moduleType === "income" || moduleType === "expense" ? (
                        <LookupCombobox
                          label=""
                          value={simplePaymentMethodLookup}
                          onValueChange={setSimplePaymentMethodLookup}
                          options={paymentMethods}
                          getOptionLabel={(method) => method.name || ""}
                          onSelect={(method) => setSimpleForm((prev) => ({ ...prev, paymentMethodId: String(method.id), accountPaymentFormId: "" }))}
                          placeholder={`-- ${t("transactions.selectPaymentMethod")} --`}
                          noResultsText={t("common.empty")}
                          required
                          hasError={simpleSubmitAttempted && !simpleForm.paymentMethodId}
                          selectedPillText={paymentMethods.find((method) => method.id === Number(simpleForm.paymentMethodId))?.name || ""}
                          onClearSelection={() => {
                            setSimpleForm((prev) => ({ ...prev, paymentMethodId: "", accountPaymentFormId: "" }));
                            setSimplePaymentMethodLookup("");
                          }}
                          renderCreateModal={({ isOpen, onClose, onCreated }) =>
                            isOpen ? (
                              <div className="modal-backdrop">
                                <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                                  <PaymentMethodQuickCreate
                                    t={t}
                                    accountId={account?.accountId}
                                    onCancel={onClose}
                                    onCreated={onCreated}
                                  />
                                </div>
                              </div>
                            ) : null
                          }
                          onCreateRecord={async (createdMethod) => {
                            const updatedMethods = await listPaymentMethods(account.accountId);
                            setPaymentMethods(updatedMethods);
                            setSimpleForm((prev) => ({ ...prev, paymentMethodId: String(createdMethod.id), accountPaymentFormId: "" }));
                            setSimplePaymentMethodLookup("");
                          }}
                        />
                      ) : (
                        <select
                          name="paymentMethodId"
                          value={simpleForm.paymentMethodId}
                          onChange={handleSimpleChange}
                          required={moduleType !== "purchase" || simpleForm.paymentMode === "cash"}
                        >
                          <option value="">{`-- ${t("transactions.selectPaymentMethod")} --`}</option>
                          {paymentMethods.map((method) => (
                            <option key={method.id} value={method.id}>
                              {method.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className={`field-block ${simpleRequiresAccountPaymentForm ? "required" : ""}`}>
                      <span>{t("transactions.accountPaymentForm")}</span>
                      {moduleType === "income" || moduleType === "expense" ? (
                        <LookupCombobox
                          label=""
                          value={simpleAccountFormLookup}
                          onValueChange={setSimpleAccountFormLookup}
                          options={simpleFilteredAccountPaymentForms}
                          getOptionLabel={(row) => formatPaymentFormLabel(row)}
                          onSelect={(row) => setSimpleForm((prev) => ({ ...prev, accountPaymentFormId: String(row.id) }))}
                          placeholder={`-- ${t("transactions.selectAccountPaymentForm")} --`}
                          noResultsText={t("common.empty")}
                          required={simpleRequiresAccountPaymentForm}
                          hasError={simpleSubmitAttempted && simpleRequiresAccountPaymentForm && !simpleForm.accountPaymentFormId}
                          selectedPillText={
                            simpleFilteredAccountPaymentForms.find((row) => row.id === Number(simpleForm.accountPaymentFormId))
                              ? formatPaymentFormLabel(
                                  simpleFilteredAccountPaymentForms.find((row) => row.id === Number(simpleForm.accountPaymentFormId))
                                )
                              : ""
                          }
                          onClearSelection={() => {
                            setSimpleForm((prev) => ({ ...prev, accountPaymentFormId: "" }));
                            setSimpleAccountFormLookup("");
                          }}
                          onCreateRecord={async (createdForm) => {
                            const updated = await listAccountPaymentForms(account.accountId);
                            setAccountPaymentForms(updated);
                            setSimpleForm((prev) => ({ ...prev, accountPaymentFormId: String(createdForm.id) }));
                            setSimpleAccountFormLookup("");
                          }}
                          renderCreateModal={({ isOpen, onClose, onCreated }) =>
                            isOpen ? (
                              <div className="modal-backdrop">
                                <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                                  <AccountPaymentFormPage embedded onCancel={onClose} onCreated={onCreated} />
                                </div>
                              </div>
                            ) : null
                          }
                        />
                      ) : (
                        <select
                          name="accountPaymentFormId"
                          value={simpleForm.accountPaymentFormId}
                          onChange={handleSimpleChange}
                          required={simpleRequiresAccountPaymentForm}
                        >
                          <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
                          {simpleFilteredAccountPaymentForms.map((form) => (
                            <option key={form.id} value={form.id}>
                              {formatPaymentFormLabel(form)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionAmounts")}</h2>
            <div className="form-grid-2">
            <label className={`field-block ${simpleSubmitAttempted && !(Number(simpleForm.amount) > 0) ? "field-error" : ""}`}>
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
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {isEdit ? t("common.update") : t("common.create")}
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
                  <option value="">{`-- ${t("transactions.selectCurrency")} --`}</option>
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
            <LookupCombobox
              label={t("transactions.clientLookup")}
                value={clientLookup}
                onValueChange={(nextValue) => {
                  setClientLookup(nextValue);
                  if (!nextValue) setSelectedClient(null);
                }}
                options={personOptions}
                getOptionLabel={(client) => client.name || ""}
                onSelect={(client) => {
                  setSelectedClient(client);
                  setClientLookup("");
                }}
                placeholder={t("transactions.lookupPlaceholder")}
              onCreateRecord={handleCreatedPerson}
              required
              hasError={saleSubmitAttempted && !selectedClient}
              renderCreateModal={({ isOpen, onClose, onCreated }) =>
                  isOpen ? (
                    <div className="modal-backdrop">
                      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <PeopleFormPage
                          embedded
                          personType={1}
                          titleKey="actions.newClient"
                          basePath="/clients"
                          onCancel={onClose}
                          onCreated={onCreated}
                        />
                      </div>
                    </div>
                  ) : null
                }
                noResultsText={t("common.empty")}
                selectedPillText={selectedClient?.name || ""}
                onClearSelection={() => {
                  setSelectedClient(null);
                  setClientLookup("");
                }}
              />
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={saleHeader.description} onChange={handleSaleHeaderChange} />
              </label>
              <label className="field-block">
                <span>{t("transactions.referenceNumber")}</span>
                <input name="referenceNumber" value={saleHeader.referenceNumber} onChange={handleSaleHeaderChange} />
              </label>
              <LookupCombobox
                label={t("projects.project")}
                value={saleProjectLookup}
                onValueChange={(nextValue) => {
                  setSaleProjectLookup(nextValue);
                  if (!nextValue) {
                    setSaleHeader((prev) => ({ ...prev, projectId: "" }));
                  }
                }}
                options={projects}
                getOptionLabel={(project) => project.name || ""}
                onSelect={(project) => {
                  setSaleProjectLookup("");
                  setSaleHeader((prev) => ({ ...prev, projectId: String(project.id) }));
                }}
                placeholder={`-- ${t("projects.optionalProject")} --`}
                onCreateRecord={handleCreatedProject}
                renderCreateModal={({ isOpen, onClose, onCreated }) =>
                  isOpen ? (
                    <div className="modal-backdrop">
                      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <ProjectFormPage embedded onCancel={onClose} onCreated={onCreated} />
                      </div>
                    </div>
                  ) : null
                }
                noResultsText={t("common.empty")}
                selectedPillText={
                  projects.find((project) => project.id === Number(saleHeader.projectId))?.name || ""
                }
                onClearSelection={() => {
                  setSaleHeader((prev) => ({ ...prev, projectId: "" }));
                  setSaleProjectLookup("");
                }}
              />
            </div>
          </section>

          {saleHeader.paymentMode === "cash" && (
            <section className="crud-form-section">
              <h2 className="crud-form-section-title">{t("transactions.sectionPayment")}</h2>
              <div className="form-grid-2">
                <label className="field-block">
                  <span>{t("transactions.paymentMethod")}</span>
                  <select name="paymentMethodId" value={saleHeader.paymentMethodId} onChange={handleSaleHeaderChange} required>
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
                    value={saleHeader.accountPaymentFormId}
                    onChange={handleSaleHeaderChange}
                    required={saleRequiresAccountPaymentForm}
                  >
                    <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
                    {saleFilteredAccountPaymentForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {formatPaymentFormLabel(form)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          <section className="crud-form-section">
            <h2 className="crud-form-section-title">{t("transactions.sectionDetail")}</h2>
            <LookupCombobox
              label={t("transactions.productLookup")}
              value={productLookup}
              onValueChange={setProductLookup}
              options={conceptOptions}
              getOptionLabel={(product) => product.name || ""}
              onSelect={(product) => {
                addSaleLine(product);
                setProductLookup("");
              }}
              placeholder={t("transactions.productLookupPlaceholder")}
              onCreateRecord={handleCreatedConcept}
              renderCreateModal={({ isOpen, onClose, onCreated }) =>
                isOpen ? (
                  <div className="modal-backdrop">
                    <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                      <ConceptModuleFormPage
                        embedded
                        moduleType="products"
                        titleKey="actions.newProduct"
                        basePath="/products"
                        onCancel={onClose}
                        onCreated={onCreated}
                      />
                    </div>
                  </div>
                ) : null
              }
              noResultsText={t("common.empty")}
            />
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
                        <input
                          type="number"
                          step="0.01"
                          value={line.additionalCharges}
                          onChange={(event) => updateSaleLine(line.rowId, "additionalCharges", event.target.value)}
                        />
                      </td>
                      <td>{lineAmounts.total.toFixed(2)}</td>
                      <td>
                        <select value={line.sellerId} onChange={(event) => updateSaleLine(line.rowId, "sellerId", event.target.value)}>
                          <option value="">{`-- ${t("transactions.optionalSeller")} --`}</option>
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
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {isEdit ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}

export default TransactionCreatePage;
