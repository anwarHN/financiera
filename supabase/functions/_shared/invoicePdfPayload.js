const text = (value) => String(value ?? "");
const amount = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value) => {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

export function amountInWords(value, currency = "") {
  const units = ["CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
  const apocope = (s) => s.replace(/VEINTIUNO$/, "VEINTIUN").replace(/UNO$/, "UN");
  const integer = (n) => {
    if (n < 30) return units[n];
    if (n < 100) return ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"][Math.floor(n / 10)] + (n % 10 ? ` Y ${units[n % 10]}` : "");
    if (n === 100) return "CIEN";
    if (n < 1000) return ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"][Math.floor(n / 100)] + (n % 100 ? ` ${integer(n % 100)}` : "");
    if (n < 1000000) return (n < 2000 ? "MIL" : `${apocope(integer(Math.floor(n / 1000)))} MIL`) + (n % 1000 ? ` ${integer(n % 1000)}` : "");
    return (n < 2000000 ? "UN MILLON" : `${apocope(integer(Math.floor(n / 1000000)))} MILLONES`) + (n % 1000000 ? ` ${integer(n % 1000000)}` : "");
  };
  const cents = Math.round((Math.abs(Number(value)) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents >= 100000000000000) throw new Error("Importe fuera de rango para impresion.");
  return `${Number(value) < 0 ? "MENOS " : ""}${integer(Math.floor(cents / 100))} CON ${String(cents % 100).padStart(2, "0")}/100 ${currency.toUpperCase()}`.trim();
}

/** Maps only supported document fields; never forwards arbitrary database JSON. */
export function buildInvoicePdfRecord({ account, transaction: tx, person, currency, details }) {
  const c = tx.correlativeSnapshot || {};
  const buckets = new Map();
  let subtotal = 0, discount = 0, exempt = 0, tax = 0, charges = 0;
  const lines = details.map((line, index) => {
    const net = Number(line.net || 0), discountAmount = Number(line.discount || 0), taxAmount = Number(line.tax || 0);
    const extra = Number(line.additionalCharges || 0);
    const base = net - discountAmount + extra;
    subtotal += net; discount += discountAmount; tax += taxAmount; charges += extra;
    if (!taxAmount) exempt += base;
    else {
      const rate = Number(line.taxPercentage || 0);
      const bucket = buckets.get(rate) || { base: 0, tax: 0 };
      bucket.base += base; bucket.tax += taxAmount; buckets.set(rate, bucket);
    }
    return { id: text(line.id), line_number: text(index + 1), description: text(line.concepts?.name),
      product_name: text(line.concepts?.name), product_code: text(line.conceptId), quantity: text(line.quantity),
      unit_price: amount(line.price), unit_price_net: amount(Number(line.quantity) ? net / Number(line.quantity) : 0),
      net_amount: amount(net), subtotal: amount(base), discount_amount: amount(discountAmount),
      discount_percent: text(line.discountPercentage || 0), tax_amount: amount(taxAmount), tax_percent: text(line.taxPercentage || 0),
      additional_charges: amount(extra), total: amount(line.total) };
  });
  const record = {
    id: text(tx.id), transaction_number: text(tx.number), transaction_number_long: text(tx.printNumber || tx.number || tx.id),
    transaction_date_dmy: date(tx.date), transaction_date: date(tx.date),
    tenant_name: text(account.name), tenant_tax_id: text(account.rtn), tenant_address: text(account.address),
    tenant_phone: text(account.phone), tenant_email: text(account.email),
    branch_name: text(account.name), branch_address: text(account.address), branch_phone: text(account.phone), branch_email: text(account.email),
    customer_display_name: text(person?.name), customer_tax_document: text(person?.rtn), person_name: text(person?.name), client_name: text(person?.name),
    client_address: text(person?.address), person_address: text(person?.address),
    currency_name: text(currency?.name), currency_symbol: text(currency?.symbol),
    payment_type_label: tx.isAccountReceivable ? "CREDITO" : "CONTADO",
    status: tx.isActive === false ? "ANULADA" : "VALIDA",
    observations: `${tx.isActive === false ? "FACTURA ANULADA. " : ""}${text(tx.name)}`,
    reference: text(tx.referenceNumber), reference_2: "", reference_3: "", reference_4: "",
    correlative_reference_1: text(c.reference1), correlative_reference_2: text(c.reference2), correlative_valid_until: date(c.limitDate),
    correlative_min_value: text(c.numberFrom), correlative_max_value: text(c.numberTo), correlative_format: text(c.printPattern),
    subtotal: amount(subtotal), subtotal_exempt: amount(exempt), subtotal_taxable: amount(subtotal - discount + charges - exempt),
    discount_total: amount(discount), tax_total: amount(tax), additional_charges: amount(charges), total: amount(tx.total),
    total_in_words: amountInWords(tx.total, currency?.name || ""), line_count: text(lines.length),
    paid_amount: amount(tx.payments), balance_amount: amount(tx.balance),
    childs: [
      { tag: "lines", type: "row", records: lines },
      { tag: "tax_bases", type: "block", records: [...buckets].map(([rate, row]) => ({ tax_percent: text(rate), tax_base_total: amount(row.base), tax_total_base: amount(row.base) })) },
      { tag: "tax_amounts", type: "block", records: [...buckets].map(([rate, row]) => ({ tax_percent: text(rate), total_tax: amount(row.tax) })) },
    ],
    blocks_to_delete: ["concepts_block", "warehouse_movements_block", ...(!lines.length ? ["lines_block"] : []), ...(!buckets.size ? ["tax_bases", "tax_amounts"] : [])],
    blocks_to_replace: lines.length ? ["lines_block"] : [],
  };
  // Legacy aliases used in the provider's default invoice headers/footers.
  Object.assign(record, {
    empresa: record.tenant_name, sucursal: record.branch_name, direccion_sucursal: record.branch_address,
    telefono_sucursal: record.branch_phone, correo_electronico_sucursal: record.branch_email, documento_tributario_empresa: record.tenant_tax_id,
    codigo_cliente: text(person?.id), nombre_cliente_seguro: record.customer_display_name, nombre_en_factura: record.customer_display_name,
    registro_tributario_cliente: record.customer_tax_document, numero_largo: record.transaction_number_long, fecha_factura: record.transaction_date_dmy,
    moneda: record.currency_name, simbolo_moneda: record.currency_symbol, tipo_credito: record.payment_type_label,
    codigo_imprenta: record.correlative_reference_2, rango: c.numberFrom ? `${c.numberFrom} - ${c.numberTo ?? ""}` : "",
    fecha_limite_emision: record.correlative_valid_until, cantidad_en_letras: record.total_in_words,
    imp_descuentos_eq: record.discount_total, imp_neto_eq: record.subtotal, imp_neto_exonerado_eq: record.subtotal_exempt,
    imp_pagos_eq: record.paid_amount, imp_saldo_eq: record.balance_amount, imp_total_eq: record.total, observaciones: record.observations,
    nro_certificado: "", nro_poliza: "", txt_contratante: "", nro_orden_compra_exenta: "", nro_registro_sag: "",
    nro_registro_secretaria: "", txt_obs_clinicas: "", totales_importes_gravados: record.subtotal_taxable, totales_impuestos: record.tax_total,
  });
  return record;
}
