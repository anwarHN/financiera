export function formatPaymentFormLabel(form) {
  const name = String(form?.name || "").trim();
  const provider = String(form?.provider || "").trim();
  if (!provider) return name;
  return `${name} - ${provider}`;
}
