export function formatNumber(value, options = {}) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2
  }).format(num);
}
