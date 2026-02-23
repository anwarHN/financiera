export function formatNumber(value, options = {}) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const rawFormatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(num);

  const autoNoCurrency = minimumFractionDigits === 0 && maximumFractionDigits === 0;
  const showCurrency = options.showCurrency ?? !autoNoCurrency;
  if (!showCurrency) return rawFormatted;

  const currencySymbol = options.currencySymbol ?? localStorage.getItem("activeCurrencySymbol") ?? "$";
  return `${currencySymbol} ${rawFormatted}`;
}
