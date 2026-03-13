import { useI18n } from "../../contexts/I18nContext";
import { formatDate, formatDateTime } from "../../utils/dateFormat";
import { formatNumber } from "../../utils/numberFormat";
import FormField from "./FormField";

function normalizeText(value, emptyValue) {
  if (value === null || value === undefined || value === "") return emptyValue;
  return String(value);
}

function ReadOnlyField({
  label,
  value,
  type = "text",
  className = "",
  emptyValue = "-",
  numberOptions,
  multiline = false
}) {
  const { language } = useI18n();

  let displayValue = emptyValue;
  let content = null;
  if (type === "date") {
    displayValue = formatDate(value, language);
  } else if (type === "datetime") {
    displayValue = formatDateTime(value, language);
  } else if (type === "currency") {
    displayValue = formatNumber(value ?? 0, numberOptions);
  } else if (type === "number") {
    displayValue = formatNumber(value ?? 0, {
      showCurrency: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      ...(numberOptions || {})
    });
  } else if (type === "boolean") {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
    const boolValue = normalized === true || normalized === 1 || normalized === "1" || normalized === "true";
    displayValue = value === null || value === undefined || value === "" ? emptyValue : language === "en" ? (boolValue ? "Yes" : "No") : (boolValue ? "Sí" : "No");
  } else {
    displayValue = normalizeText(value, emptyValue);
  }

  const isMultiline = multiline || type === "multiline";
  if (type === "email" && value) {
    const emailValue = normalizeText(value, emptyValue);
    content = emailValue === emptyValue ? emailValue : <a href={`mailto:${emailValue}`}>{emailValue}</a>;
  } else if (type === "phone" && value) {
    const phoneValue = normalizeText(value, emptyValue);
    const hrefPhone = phoneValue.replace(/\s+/g, "");
    content = phoneValue === emptyValue ? phoneValue : <a href={`tel:${hrefPhone}`}>{phoneValue}</a>;
  } else {
    content = displayValue;
  }

  return (
    <FormField label={label} className={className}>
      <div className={`readonly-field-value ${isMultiline ? "readonly-field-value-multiline" : ""}`.trim()}>
        {content}
      </div>
    </FormField>
  );
}

export default ReadOnlyField;
