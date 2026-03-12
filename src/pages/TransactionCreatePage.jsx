import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LookupCombobox from "../components/LookupCombobox";
import ToggleSwitch from "../components/ToggleSwitch";
import TagsLookupField from "../components/TagsLookupField";
import AccountPaymentFormPage from "./AccountPaymentFormPage";
import CashboxFormPage from "./CashboxFormPage";
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
  listUsedTransactionTags,
  listTransactionDetails,
  TRANSACTION_TYPES,
  updateTransactionWithDetails
} from "../services/transactionsService";
import { formatNumber } from "../utils/numberFormat";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const INVENTORY_ADJUSTMENT_TAG = "__inventory_adjustment__";
const PRIOR_BALANCE_TAG = "__prior_balance__";
const MANUAL_RECEIVABLE_TAG = "__manual_receivable__";
const MANUAL_PAYABLE_TAG = "__manual_payable__";

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
    conceptFilter: (item) => Boolean(item.isProduct) && item.productType !== "service",
    backPath: "/purchases"
  },
  inventoryAdjustment: {
    type: TRANSACTION_TYPES.expense,
    titleKey: "transactions.inventoryAdjustmentsCreateTitle",
    personFilter: null,
    conceptFilter: (item) => Boolean(item.isProduct) && item.productType !== "service",
    backPath: "/inventory-adjustments"
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
  employeeId: "",
  affectsPayroll: false,
  comments: "",
  tags: []
};

const initialSaleHeader = {
  date: new Date().toISOString().slice(0, 10),
  paymentMode: "cash",
  description: "",
  currencyId: "",
  referenceNumber: "",
  paymentMethodId: "",
  accountPaymentFormId: "",
  projectId: "",
  tags: []
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

function TransactionCreatePage({ moduleType, entryMode = "default", embedded = false, onCancel, onCreated, itemId = null }) {
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
  const [tagOptions, setTagOptions] = useState([]);

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
  const [simpleTagLookup, setSimpleTagLookup] = useState("");
  const [priorBalanceAddPendingProducts, setPriorBalanceAddPendingProducts] = useState(false);
  const [priorBalanceProductLookup, setPriorBalanceProductLookup] = useState("");
  const [priorBalanceProductLines, setPriorBalanceProductLines] = useState([]);
  const [saleProjectLookup, setSaleProjectLookup] = useState("");
  const [saleTagLookup, setSaleTagLookup] = useState("");
  const [productLookup, setProductLookup] = useState("");
  const [saleLines, setSaleLines] = useState([]);
  const [invoicePendingDelivery, setInvoicePendingDelivery] = useState(false);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [simpleSubmitAttempted, setSimpleSubmitAttempted] = useState(false);
  const [saleSubmitAttempted, setSaleSubmitAttempted] = useState(false);
  const isEdit = Boolean(itemId);

  const conceptOptions = useMemo(() => concepts.filter(config.conceptFilter), [concepts, config.conceptFilter]);
  const incomingPaymentConcept = useMemo(
    () => concepts.find((item) => item.isIncomingPaymentConcept) ?? null,
    [concepts]
  );
  const outgoingPaymentConcept = useMemo(
    () => concepts.find((item) => item.isOutgoingPaymentConcept) ?? null,
    [concepts]
  );
  const isPriorBalanceMode = entryMode === "priorBalance" && (moduleType === "sale" || moduleType === "purchase");
  const isManualReceivableMode = entryMode === "receivable" && moduleType === "sale";
  const isManualPayableMode = entryMode === "payable" && moduleType === "purchase";
  const isManualBalanceMode = isManualReceivableMode || isManualPayableMode;
  const isLineBasedTransaction =
    ((!isPriorBalanceMode && !isManualBalanceMode && moduleType === "sale") ||
      (!isPriorBalanceMode && !isManualBalanceMode && moduleType === "purchase") ||
      moduleType === "inventoryAdjustment");
  const pageTitleKey = isManualReceivableMode
    ? "transactions.receivableCreateTitle"
    : isManualPayableMode
      ? "transactions.payableCreateTitle"
      : config.titleKey;
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
      const [personsRes, conceptsRes, employeesRes, currenciesRes, paymentMethodsRes, accountPaymentFormsRes, projectsRes, tagsRes] = await Promise.allSettled([
        listPersons(account.accountId),
        listConcepts(account.accountId),
        listEmployees(account.accountId),
        listCurrencies(account.accountId),
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId),
        listProjects(account.accountId),
        listUsedTransactionTags(account.accountId)
      ]);

      setPersons(personsRes.status === "fulfilled" ? personsRes.value : []);
      setConcepts(conceptsRes.status === "fulfilled" ? conceptsRes.value : []);
      setEmployees(employeesRes.status === "fulfilled" ? employeesRes.value : []);
      setCurrencies(currenciesRes.status === "fulfilled" ? currenciesRes.value : []);
      setPaymentMethods(paymentMethodsRes.status === "fulfilled" ? paymentMethodsRes.value : []);
      setAccountPaymentForms(accountPaymentFormsRes.status === "fulfilled" ? accountPaymentFormsRes.value : []);
      setProjects(projectsRes.status === "fulfilled" ? projectsRes.value : []);
      setTagOptions(tagsRes.status === "fulfilled" ? tagsRes.value : []);
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
      if (moduleType === "sale" && !isPriorBalanceMode && !isManualBalanceMode) {
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
        if (isPriorBalanceMode) {
          addPriorBalanceProductLine(created);
        } else {
          addSaleLine(created);
        }
      }
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const handleCreatedProject = async (created) => {
    try {
      const updatedProjects = await listProjects(account.accountId);
      setProjects(updatedProjects);
      if (moduleType === "sale" && !isManualBalanceMode) {
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

      if (isLineBasedTransaction) {
        setSaleHeader({
          date: tx.date || initialSaleHeader.date,
          paymentMode: tx.isAccountReceivable || tx.isAccountPayable ? "credit" : "cash",
          description: tx.name || "",
          currencyId: tx.currencyId ? String(tx.currencyId) : "",
          referenceNumber: tx.referenceNumber || "",
          paymentMethodId: tx.paymentMethodId ? String(tx.paymentMethodId) : "",
          accountPaymentFormId: tx.accountPaymentFormId ? String(tx.accountPaymentFormId) : "",
          projectId: tx.projectId ? String(tx.projectId) : "",
          tags: Array.isArray(tx.tags) ? tx.tags : []
        });
        setSelectedClient(
          tx.personId
            ? {
                id: tx.personId,
                name: tx.persons?.name || ""
              }
            : null
        );
        const editableLines =
          moduleType === "purchase"
            ? (details || []).filter((line) => Boolean(line.concepts?.isProduct))
            : details || [];
        const hasPendingDelivery = editableLines.some((line) => Boolean(line.pendingDelivery));
        setInvoicePendingDelivery(hasPendingDelivery);
        setSaleLines(
          editableLines.map((line) => ({
            rowId: String(line.id || `${Date.now()}-${Math.random()}`),
            conceptId: Number(line.conceptId),
            conceptName: line.concepts?.name || "",
            quantity: Number(line.quantity) || 0,
            quantityDelivered:
              line.pendingDelivery
                ? Math.min(Math.max(Number(line.quantityDelivered || 0), 0), Math.max(Number(line.quantity || 0), 0))
                : Math.max(Number(line.quantity || 0), 0),
            pendingDelivery: Boolean(line.pendingDelivery),
            price: Number(line.price) || 0,
            taxPercentage: Number(line.taxPercentage) || 0,
            discountPercentage: Number(line.discountPercentage) || 0,
            additionalCharges: Number(line.additionalCharges) || 0,
            sellerId: line.sellerId ? String(line.sellerId) : ""
          }))
        );
      } else {
        const firstDetail = details?.[0] ?? null;
        const priorBalancePendingLines = isPriorBalanceMode
          ? (details || []).filter((line) => Boolean(line.pendingDelivery) && Number(line.quantity || 0) > 0)
          : [];
        const conceptId = firstDetail?.conceptId ? String(firstDetail.conceptId) : "";
        const amountValue = isPriorBalanceMode || isManualBalanceMode ? Number(tx.total || 0) : Number(firstDetail?.price || 0);
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
          employeeId: tx.employeeId ? String(tx.employeeId) : "",
          affectsPayroll: Boolean(tx.affectsPayroll),
          comments: tx.deliveryAddress || "",
          tags: Array.isArray(tx.tags) ? tx.tags : []
        });
        if (isPriorBalanceMode && moduleType === "sale") {
          setPriorBalanceAddPendingProducts(priorBalancePendingLines.length > 0);
          setPriorBalanceProductLines(
            priorBalancePendingLines.map((line) => ({
              rowId: String(line.id || `${Date.now()}-${Math.random()}`),
              conceptId: Number(line.conceptId),
              conceptName: line.concepts?.name || "",
              quantity: Math.max(Number(line.quantity || 0), 0)
            }))
          );
        }
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
    if (name === "affectsPayroll") {
      setSimpleForm((prev) => ({ ...prev, affectsPayroll: event.target.checked }));
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

  const addPriorBalanceProductLine = (concept) => {
    setPriorBalanceProductLines((prev) => {
      const existing = prev.find((line) => Number(line.conceptId) === Number(concept.id));
      if (existing) {
        return prev.map((line) =>
          Number(line.conceptId) === Number(concept.id)
            ? { ...line, quantity: Math.max(Number(line.quantity || 0), 0) + 1 }
            : line
        );
      }

      return [
        ...prev,
        {
          rowId: `prior-balance-${concept.id}-${Date.now()}-${Math.random()}`,
          conceptId: Number(concept.id),
          conceptName: concept.name || "",
          quantity: 1
        }
      ];
    });
    setPriorBalanceProductLookup("");
  };

  const updatePriorBalanceProductLine = (rowId, value) => {
    const safeValue = Math.max(Number(value || 0), 0);
    setPriorBalanceProductLines((prev) =>
      prev.map((line) => (line.rowId === rowId ? { ...line, quantity: safeValue } : line))
    );
  };

  const removePriorBalanceProductLine = (rowId) => {
    setPriorBalanceProductLines((prev) => prev.filter((line) => line.rowId !== rowId));
  };

  const addSaleLine = (concept) => {
    const currentStock = Number(concept.stock || 0);
    const initialQuantity = moduleType === "inventoryAdjustment" ? 0 : 1;
    const isPending = moduleType === "sale" ? invoicePendingDelivery : false;
    setSaleLines((prev) => [
      ...prev,
      {
        rowId: `${concept.id}-${Date.now()}-${Math.random()}`,
        conceptId: concept.id,
        conceptName: concept.name,
        quantity: initialQuantity,
        quantityDelivered: moduleType === "sale" ? initialQuantity : 0,
        pendingDelivery: isPending,
        price: Number(concept.price) || 0,
        taxPercentage: Number(concept.taxPercentage) || 0,
        discountPercentage: 0,
        additionalCharges: Number(concept.additionalCharges) || 0,
        currentStock,
        sellerId: ""
      }
    ]);
    setProductLookup("");
  };

  const handleInvoicePendingDeliveryChange = (checked) => {
    setInvoicePendingDelivery(checked);
    setSaleLines((prev) =>
      prev.map((line) => {
        if (moduleType !== "sale") return line;
        const safeQty = Math.max(Number(line.quantity || 0), 0);
        return {
          ...line,
          pendingDelivery: checked,
          quantityDelivered: safeQty
        };
      })
    );
  };

  const updateSaleLine = (rowId, field, value) => {
    setSaleLines((prev) =>
      prev.map((line) => {
        if (line.rowId !== rowId) return line;
        const next = { ...line, [field]: value };
        const safeQty = Math.max(Number(next.quantity || 0), 0);

        if (field === "pendingDelivery") {
          const isPending = Boolean(value);
          next.pendingDelivery = isPending;
          next.quantityDelivered = safeQty;
          return next;
        }

        if (field === "quantity") {
          next.quantityDelivered = Boolean(next.pendingDelivery)
            ? Math.min(Math.max(Number(next.quantityDelivered || 0), 0), safeQty)
            : safeQty;
          return next;
        }

        if (field === "quantityDelivered") {
          next.quantityDelivered = Math.min(Math.max(Number(next.quantityDelivered || 0), 0), safeQty);
          return next;
        }

        return next;
      })
    );
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
    tags = [],
    incomingPayment = false,
    includeCreatedById = true,
    affectsPayroll = false
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
      affectsPayroll: Boolean(employeeId) && Boolean(affectsPayroll),
      tags: Array.isArray(tags)
        ? tags
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [],
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
    if (!account?.accountId || !user?.id || !simpleForm.currencyId || (!isLineBasedTransaction && !isManualBalanceMode && !simpleForm.conceptId)) {
      setError(t("common.requiredFields"));
      return;
    }
    if ((moduleType === "purchase" || isManualReceivableMode) && !simpleForm.personId) {
      setError(t(isManualReceivableMode ? "transactions.clientRequired" : "transactions.providerRequired"));
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
    const isCredit = isManualBalanceMode ? true : moduleType === "purchase" ? simpleForm.paymentMode === "credit" : false;
    const shouldPersistPayment = moduleType !== "purchase" || simpleForm.paymentMode === "cash";

    const transactionPayload = buildTransactionPayload({
      isCredit,
      personId: simpleForm.personId ? Number(simpleForm.personId) : null,
      description:
        simpleForm.description ||
        (isManualReceivableMode
          ? t("transactions.manualReceivableDescription")
          : isManualPayableMode
            ? t("transactions.manualPayableDescription")
            : ""),
      date: simpleForm.date,
      totals: { net: baseAmount, tax: 0, discount: 0, additionalCharges, total: totalAmount },
      currencyId: simpleForm.currencyId,
      referenceNumber: simpleForm.referenceNumber,
      paymentMethodId: shouldPersistPayment && !isManualBalanceMode ? simpleForm.paymentMethodId : null,
      accountPaymentFormId: shouldPersistPayment && !isManualBalanceMode ? simpleForm.accountPaymentFormId : null,
      projectId: simpleForm.projectId,
      employeeId: moduleType === "income" || moduleType === "expense" ? simpleForm.employeeId : null,
      affectsPayroll: moduleType === "income" || moduleType === "expense" ? simpleForm.affectsPayroll : false,
      tags: isManualReceivableMode
        ? Array.from(new Set([MANUAL_RECEIVABLE_TAG, ...(simpleForm.tags || [])]))
        : isManualPayableMode
          ? Array.from(new Set([MANUAL_PAYABLE_TAG, ...(simpleForm.tags || [])]))
          : simpleForm.tags,
      incomingPayment: moduleType === "income",
      includeCreatedById: !isEdit
    });
    transactionPayload.deliveryAddress = simpleForm.comments?.trim() || null;

    const detailPayload = isManualBalanceMode
      ? null
      : {
          conceptId: Number(simpleForm.conceptId),
          quantity: 1,
          quantityDelivered: 1,
          pendingDelivery: false,
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
          details: detailPayload ? [detailPayload] : []
        });
      } else {
        saved = await createTransactionWithDetails({ transaction: transactionPayload, details: detailPayload ? [detailPayload] : [] });
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

  const handleSubmitPriorBalance = async (event) => {
    event.preventDefault();
    setSimpleSubmitAttempted(true);
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!account?.accountId || !user?.id || !simpleForm.currencyId || !simpleForm.personId) {
      setError(t("common.requiredFields"));
      return;
    }

    const selectedDate = new Date(`${simpleForm.date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!(selectedDate < today)) {
      setError(t("transactions.priorBalanceDateValidation"));
      return;
    }

    const totalAmount = Math.abs(Number(simpleForm.amount) || 0);
    if (!isPriorBalanceMode && totalAmount <= 0) {
      setError(t("transactions.invalidTransactionAmount"));
      return;
    }

    const transactionPayload = buildTransactionPayload({
      isCredit: true,
      personId: Number(simpleForm.personId),
      description:
        simpleForm.description?.trim() ||
        (moduleType === "sale" ? t("transactions.priorBalanceSaleDescription") : t("transactions.priorBalancePurchaseDescription")),
      date: simpleForm.date,
      totals: { net: totalAmount, tax: 0, discount: 0, additionalCharges: 0, total: totalAmount },
      currencyId: simpleForm.currencyId,
      referenceNumber: simpleForm.referenceNumber,
      paymentMethodId: null,
      accountPaymentFormId: null,
      projectId: null,
      tags: [PRIOR_BALANCE_TAG],
      incomingPayment: false,
      includeCreatedById: !isEdit
    });

    const shouldAddPendingProducts = moduleType === "sale" && priorBalanceAddPendingProducts;
    const pendingProductDetails = shouldAddPendingProducts
      ? priorBalanceProductLines
          .map((line) => ({
            conceptId: Number(line.conceptId),
            quantity: Math.max(Number(line.quantity || 0), 0)
          }))
          .filter((line) => line.conceptId > 0 && line.quantity > 0)
          .map((line) => ({
            conceptId: line.conceptId,
            quantity: line.quantity,
            quantityDelivered: 0,
            pendingDelivery: true,
            price: 0,
            net: 0,
            taxPercentage: 0,
            tax: 0,
            discountPercentage: 0,
            discount: 0,
            total: 0,
            additionalCharges: 0,
            createdById: user.id,
            sellerId: null,
            transactionPaidId: null
          }))
      : [];

    if (shouldAddPendingProducts && pendingProductDetails.length === 0) {
      setError(t("transactions.priorBalancePendingProductsValidation"));
      return;
    }

    try {
      setIsSaving(true);
      const saved = isEdit
        ? await updateTransactionWithDetails({
            transactionId: Number(itemId),
            transaction: transactionPayload,
            details: pendingProductDetails
          })
        : await createTransactionWithDetails({
            transaction: transactionPayload,
            details: pendingProductDetails
          });
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
    const requiresPerson = moduleType === "sale" || moduleType === "purchase";
    if (!account?.accountId || !user?.id || (requiresPerson && !selectedClient) || saleLines.length === 0 || !saleHeader.currencyId) {
      setError(t("transactions.saleValidationError"));
      return;
    }
    const isInventoryAdjustment = moduleType === "inventoryAdjustment";
    const isCredit = !isInventoryAdjustment && saleHeader.paymentMode === "credit";
    if (!isInventoryAdjustment && !isCredit && !saleHeader.paymentMethodId) {
      setError(t("transactions.paymentMethodRequired"));
      return;
    }
    if (!isInventoryAdjustment && saleRequiresAccountPaymentForm && !saleHeader.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const inventoryAdjustmentLines =
      moduleType === "inventoryAdjustment"
        ? saleLines
            .map((line) => ({
              ...line,
              adjustmentQty: Number(line.quantity || 0)
            }))
            .filter((line) => Math.abs(Number(line.adjustmentQty || 0)) > 0)
        : [];
    if (moduleType === "inventoryAdjustment" && inventoryAdjustmentLines.length === 0) {
      setError(t("transactions.invalidTransactionAmount"));
      return;
    }

    const lineBasedTotal = Number(saleTotals.total || 0);
    const normalizedTotal = isInventoryAdjustment ? 0 : lineBasedTotal;
    const transactionPayload = buildTransactionPayload({
      isCredit,
      personId: selectedClient?.id || null,
      description: saleHeader.description,
      date: saleHeader.date,
      totals: {
        ...saleTotals,
        net: normalizedTotal,
        tax: 0,
        discount: 0,
        additionalCharges: 0,
        total: normalizedTotal
      },
      currencyId: saleHeader.currencyId,
      referenceNumber: saleHeader.referenceNumber,
      paymentMethodId: isCredit || isInventoryAdjustment ? null : saleHeader.paymentMethodId,
      accountPaymentFormId: isCredit || isInventoryAdjustment ? null : saleHeader.accountPaymentFormId,
      projectId: saleHeader.projectId,
      tags: isInventoryAdjustment
        ? Array.from(new Set([...(saleHeader.tags || []), INVENTORY_ADJUSTMENT_TAG]))
        : saleHeader.tags,
      incomingPayment: false,
      includeCreatedById: !isEdit
    });

    const detailPayloads =
      moduleType === "purchase"
        ? saleLines.map((line) => {
            const amounts = calculateLineAmounts(line);
            return {
              conceptId: Number(line.conceptId),
              quantity: Math.abs(amounts.quantity),
              quantityDelivered: Math.abs(amounts.quantity),
              pendingDelivery: false,
              price: Math.abs(amounts.price),
              net: Math.abs(amounts.net),
              taxPercentage: amounts.taxPercentage,
              tax: Math.abs(amounts.tax),
              discountPercentage: amounts.discountPercentage,
              discount: Math.abs(amounts.discount),
              total: Math.abs(amounts.total),
              additionalCharges: Math.abs(amounts.additionalCharges),
              createdById: user.id,
              sellerId: null,
              transactionPaidId: null
            };
          })
        : moduleType === "inventoryAdjustment"
          ? inventoryAdjustmentLines.map((line) => ({
              conceptId: Number(line.conceptId),
              quantity: Number(line.adjustmentQty),
              quantityDelivered: 0,
              pendingDelivery: false,
              price: 0,
              net: 0,
              taxPercentage: 0,
              tax: 0,
              discountPercentage: 0,
              discount: 0,
              total: 0,
              additionalCharges: 0,
              createdById: user.id,
              sellerId: null,
              transactionPaidId: null
            }))
          : saleLines.map((line) => {
              const amounts = calculateLineAmounts(line);
              return {
                conceptId: Number(line.conceptId),
                quantity: amounts.quantity,
                quantityDelivered: Boolean(line.pendingDelivery)
                  ? Math.min(Math.max(Number(line.quantityDelivered || 0), 0), Math.max(Number(amounts.quantity || 0), 0))
                  : Math.max(Number(amounts.quantity || 0), 0),
                pendingDelivery: Boolean(line.pendingDelivery),
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
          <h1>{t(pageTitleKey)}</h1>
          <Link to={config.backPath} className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t(pageTitleKey)}</h3>
      )}

      {error && <p className="error-text">{error}</p>}

      {isPriorBalanceMode ? (
        <form className="crud-form" onSubmit={handleSubmitPriorBalance}>
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
              <div className={`field-block required ${simpleSubmitAttempted && !simpleForm.personId ? "field-error" : ""}`}>
                <span>{moduleType === "sale" ? t("clients.title") : t("providers.title")}</span>
                <LookupCombobox
                  label=""
                  value={simplePersonLookup}
                  onValueChange={setSimplePersonLookup}
                  options={personOptions}
                  getOptionLabel={(person) => person.name || ""}
                  onSelect={(person) => setSimpleForm((prev) => ({ ...prev, personId: String(person.id) }))}
                  placeholder={`-- ${moduleType === "sale" ? t("transactions.lookupPlaceholder") : t("transactions.selectProvider")} --`}
                  noResultsText={t("common.empty")}
                  required
                  hasError={simpleSubmitAttempted && !simpleForm.personId}
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
                            personType={moduleType === "sale" ? 1 : 2}
                            titleKey={moduleType === "sale" ? "actions.newClient" : "actions.newProvider"}
                            basePath={moduleType === "sale" ? "/clients" : "/providers"}
                            onCancel={onClose}
                            onCreated={onCreated}
                          />
                        </div>
                      </div>
                    ) : null
                  }
                />
              </div>
              <label className="field-block">
                <span>{t("transactions.amount")}</span>
                <input type="number" min="0" step="0.01" name="amount" value={simpleForm.amount} onChange={handleSimpleChange} required />
              </label>
            </div>
          </section>

          {moduleType === "sale" ? (
            <section className="crud-form-section">
              <h2 className="crud-form-section-title">{t("transactions.sectionDetail")}</h2>
              <ToggleSwitch
                label={t("transactions.addPendingDeliveryProducts")}
                checked={priorBalanceAddPendingProducts}
                onChange={(event) => setPriorBalanceAddPendingProducts(event.target.checked)}
                helpText={t("transactions.addPendingDeliveryProductsHelp")}
              />
              {priorBalanceAddPendingProducts ? (
                <>
                  <LookupCombobox
                    label={t("transactions.productLookup")}
                    value={priorBalanceProductLookup}
                    onValueChange={setPriorBalanceProductLookup}
                    options={conceptOptions}
                    getOptionLabel={(product) => product.name || ""}
                    onSelect={(product) => addPriorBalanceProductLine(product)}
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
                  <table className="crud-table invoice-lines-table">
                    <thead>
                      <tr>
                        <th>{t("transactions.product")}</th>
                        <th className="num-col">{t("inventory.deliveries.pendingQuantity")}</th>
                        <th>{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priorBalanceProductLines.length === 0 ? (
                        <tr>
                          <td colSpan={3}>{t("transactions.noLines")}</td>
                        </tr>
                      ) : (
                        priorBalanceProductLines.map((line) => (
                          <tr key={line.rowId}>
                            <td>{line.conceptName}</td>
                            <td className="num-col">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.quantity}
                                onChange={(event) => updatePriorBalanceProductLine(line.rowId, event.target.value)}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="button-danger"
                                onClick={() => removePriorBalanceProductLine(line.rowId)}
                              >
                                {t("common.delete")}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </>
              ) : null}
            </section>
          ) : null}

          <div className="crud-form-actions">
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {isSaving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      ) : !isLineBasedTransaction ? (
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
                    <select
                      name="personId"
                      value={simpleForm.personId}
                      onChange={handleSimpleChange}
                      required={moduleType === "purchase" || isManualReceivableMode}
                    >
                      <option value="">
                        {isManualReceivableMode
                          ? `-- ${t("transactions.selectClient")} --`
                          : moduleType === "purchase"
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
              {!isManualBalanceMode ? (
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
              ) : null}
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={simpleForm.description} onChange={handleSimpleChange} />
              </label>
              {isManualBalanceMode ? (
                <label className="field-block form-span-2">
                  <span>{t("transactions.comments")}</span>
                  <textarea name="comments" value={simpleForm.comments} onChange={handleSimpleChange} rows={3} />
                </label>
              ) : null}
              <div className="form-span-2">
                <TagsLookupField
                  label={t("transactions.tags")}
                  value={simpleTagLookup}
                  onValueChange={setSimpleTagLookup}
                  options={tagOptions}
                  selectedTags={simpleForm.tags}
                  onSelectedTagsChange={(tags) => setSimpleForm((prev) => ({ ...prev, tags }))}
                  placeholder={t("transactions.tagsPlaceholder")}
                  noResultsText={t("common.empty")}
                />
              </div>
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
                      setSimpleForm((prev) => ({ ...prev, employeeId: "", affectsPayroll: false }));
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
                    setSimpleForm((prev) => ({ ...prev, employeeId: "", affectsPayroll: false }));
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
              {(moduleType === "income" || moduleType === "expense") && simpleForm.employeeId ? (
                <ToggleSwitch
                  label={t("transactions.affectsPayroll")}
                  checked={Boolean(simpleForm.affectsPayroll)}
                  onChange={handleSimpleChange}
                  name="affectsPayroll"
                  helpText={t("transactions.affectsPayrollHelp")}
                />
              ) : null}
            </div>
          </section>

          {!isManualBalanceMode && (moduleType === "purchase" || moduleType === "income" || moduleType === "expense") && (
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
                      <span>{selectedSimplePaymentMethod?.code === "cash" ? t("transactions.cashbox") : t("transactions.accountPaymentForm")}</span>
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
                                  {selectedSimplePaymentMethod?.code === "cash" ? (
                                    <CashboxFormPage embedded onCancel={onClose} onCreated={onCreated} />
                                  ) : (
                                    <AccountPaymentFormPage embedded onCancel={onClose} onCreated={onCreated} />
                                  )}
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
            <label
              className={`field-block ${simpleSubmitAttempted && !isPriorBalanceMode && !(Number(simpleForm.amount) > 0) ? "field-error" : ""}`}
            >
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
            {t("transactions.summary")} {formatNumber(Number(simpleForm.amount || 0) + Number(simpleForm.additionalCharges || 0))}
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
              {moduleType !== "inventoryAdjustment" ? (
                <label className="field-block">
                  <span>{t("transactions.paymentMode")}</span>
                  <select name="paymentMode" value={saleHeader.paymentMode} onChange={handleSaleHeaderChange}>
                    <option value="cash">{t("transactions.cash")}</option>
                    <option value="credit">{t("transactions.credit")}</option>
                  </select>
                </label>
              ) : null}
            {moduleType === "sale" || moduleType === "purchase" ? (
              <LookupCombobox
                label={moduleType === "purchase" ? t("transactions.selectProvider") : t("transactions.clientLookup")}
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
                placeholder={moduleType === "purchase" ? t("transactions.selectProvider") : t("transactions.lookupPlaceholder")}
                onCreateRecord={handleCreatedPerson}
                required
                hasError={saleSubmitAttempted && !selectedClient}
                renderCreateModal={({ isOpen, onClose, onCreated }) =>
                  isOpen ? (
                    <div className="modal-backdrop">
                      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                        <PeopleFormPage
                          embedded
                          personType={moduleType === "purchase" ? 2 : 1}
                          titleKey={moduleType === "purchase" ? "actions.newProvider" : "actions.newClient"}
                          basePath={moduleType === "purchase" ? "/providers" : "/clients"}
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
            ) : null}
              <label className="field-block form-span-2">
                <span>{t("transactions.description")}</span>
                <input name="description" value={saleHeader.description} onChange={handleSaleHeaderChange} />
              </label>
              <div className="form-span-2">
                <TagsLookupField
                  label={t("transactions.tags")}
                  value={saleTagLookup}
                  onValueChange={setSaleTagLookup}
                  options={tagOptions}
                  selectedTags={saleHeader.tags}
                  onSelectedTagsChange={(tags) => setSaleHeader((prev) => ({ ...prev, tags }))}
                  placeholder={t("transactions.tagsPlaceholder")}
                  noResultsText={t("common.empty")}
                />
              </div>
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

          {moduleType !== "inventoryAdjustment" && saleHeader.paymentMode === "cash" && (
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
                  <span>{selectedSalePaymentMethod?.code === "cash" ? t("transactions.cashbox") : t("transactions.accountPaymentForm")}</span>
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
            <div className="detail-tools-row">
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
              {moduleType === "sale" ? (
                <ToggleSwitch
                  label={t("products.pendingDelivery")}
                  helpText={t("products.pendingDeliveryHelp")}
                  align="right"
                  checked={invoicePendingDelivery}
                  onChange={(event) => handleInvoicePendingDeliveryChange(event.target.checked)}
                />
              ) : null}
            </div>
          </section>

          <table className="crud-table invoice-lines-table">
            <thead>
              <tr>
                <th>{t("transactions.product")}</th>
                {moduleType === "inventoryAdjustment" ? (
                  <>
                    <th>{t("products.stock")}</th>
                    <th>{t("transactions.adjustment")}</th>
                    <th>{t("transactions.realStock")}</th>
                  </>
                ) : (
                  <>
                    <th>{t("transactions.quantity")}</th>
                    <th>{t("transactions.price")}</th>
                    <th>{t("transactions.taxPercentage")}</th>
                    <th>{t("transactions.discountPercentage")}</th>
                    <th>{t("transactions.additionalCharges")}</th>
                    <th>{t("transactions.lineTotal")}</th>
                  </>
                )}
                {moduleType === "sale" ? <th>{t("transactions.seller")}</th> : null}
                {moduleType === "sale" && invoicePendingDelivery ? <th>{t("inventory.deliveries.deliveredQuantity")}</th> : null}
                {moduleType === "sale" ? <th>{t("transactions.pendingDeliveryProducts")}</th> : null}
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {saleLines.length === 0 ? (
                <tr>
                  <td colSpan={moduleType === "sale" ? (invoicePendingDelivery ? 11 : 10) : moduleType === "inventoryAdjustment" ? 5 : 8}>
                    {t("transactions.noLines")}
                  </td>
                </tr>
              ) : (
                saleLines.map((line) => {
                  const lineAmounts = calculateLineAmounts(line);
                  const currentStock = Number(line.currentStock || 0);
                  const adjustmentQty = Number(line.quantity || 0);
                  const resultingStock = currentStock + adjustmentQty;
                  return (
                    <tr key={line.rowId}>
                      <td>{line.conceptName}</td>
                      {moduleType === "inventoryAdjustment" ? (
                        <>
                          <td>{formatNumber(currentStock, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              value={line.quantity}
                              onChange={(event) => updateSaleLine(line.rowId, "quantity", event.target.value)}
                            />
                          </td>
                          <td>{formatNumber(resultingStock, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                        </>
                      ) : (
                        <>
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
                          <td>{formatNumber(lineAmounts.total)}</td>
                        </>
                      )}
                      {moduleType === "sale" ? (
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
                      ) : null}
                      {moduleType === "sale" ? (
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!Boolean(line.pendingDelivery)}
                            value={line.quantityDelivered}
                            onChange={(event) => updateSaleLine(line.rowId, "quantityDelivered", event.target.value)}
                          />
                        </td>
                      ) : null}
                      {moduleType === "sale" ? (
                        <td>
                          <label className="checkbox-field">
                            <input
                              type="checkbox"
                              checked={Boolean(line.pendingDelivery)}
                              onChange={(event) => updateSaleLine(line.rowId, "pendingDelivery", event.target.checked)}
                            />
                            {t("common.yes")}
                          </label>
                        </td>
                      ) : null}
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
            {t("transactions.summary")} {formatNumber(saleTotals.total)}
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
