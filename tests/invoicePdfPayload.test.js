import test from "node:test";
import assert from "node:assert/strict";
import { amountInWords, buildInvoicePdfRecord } from "../supabase/functions/_shared/invoicePdfPayload.js";
import { translations } from "../src/i18n/translations.js";
import { readFileSync } from "node:fs";

test("integration and PDF controls have translations in both languages", () => {
  for (const path of ["src/components/InvoicePdfButton.jsx", "src/pages/AccountIntegrationsPage.jsx"]) {
    const keys = [...readFileSync(path, "utf8").matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]);
    for (const language of ["es", "en"]) for (const key of keys) {
      assert.equal(typeof key.split(".").reduce((value, part) => value?.[part], translations[language]), "string", `${language}: ${key}`);
    }
  }
});

test("invoice detail exposes one print action and PDF generation starts from the modal", () => {
  const detailSource = readFileSync("src/pages/TransactionDetailPage.jsx", "utf8");
  const buttonSource = readFileSync("src/components/InvoicePdfButton.jsx", "utf8");
  assert.doesNotMatch(detailSource, /printInvoiceTxt\s*}/);
  assert.match(buttonSource, /onClick=\{openAndGenerate\}/);
  assert.match(buttonSource, /void generate\(templateId\)/);
  assert.match(buttonSource, /void generate\(selectedTemplateId\)/);
  assert.doesNotMatch(buttonSource, /t\("imprent\.generate"\)/);
});

test("PDF uses persisted invoice number and correlative snapshot, line tax and discount", () => {
  const record = buildInvoicePdfRecord({
    account: { name: "Company", address: "Address", rtn: "08011999123456" }, person: { id: 1, name: "Customer", rtn: "01011988123456" }, currency: { name: "Lempiras", symbol: "L" },
    transaction: { id: 100, number: 7, printNumber: "001-00000007", total: 105.5, date: "2026-10-01T00:00:00Z",
      correlativeSnapshot: { reference1: "CAI", numberFrom: 1, numberTo: 100, limitDate: "2026-12-31" } },
    details: [{ id: 1, conceptId: 5, quantity: 2, price: 50, net: 100, discount: 10, tax: 13.5, taxPercentage: 15, total: 103.5, concepts: { name: "Service" } },
      { id: 2, conceptId: 6, quantity: 1, price: 2, net: 2, tax: 0, total: 2 }],
  });
  assert.equal(record.transaction_number_long, "001-00000007");
  assert.equal(record.tenant_tax_id, "08011999123456");
  assert.equal(record.documento_tributario_empresa, record.tenant_tax_id);
  assert.equal(record.customer_tax_document, "01011988123456");
  assert.equal(record.registro_tributario_cliente, record.customer_tax_document);
  assert.equal(record.correlative_reference_1, "CAI");
  assert.equal(record.transaction_date_dmy, "01/10/2026");
  assert.equal(record.subtotal, "102.00"); assert.equal(record.subtotal_exempt, "2.00");
  assert.equal(record.discount_total, "10.00"); assert.equal(record.tax_total, "13.50");
  assert.equal(record.childs[1].records[0].tax_base_total, "90.00");
  assert.equal(record.childs[0].records[0].subtotal, "90.00");
  assert.equal(record.total_in_words, "CIENTO CINCO CON 50/100 LEMPIRAS");
  assert.ok(record.blocks_to_replace.every((key) => !record.blocks_to_delete.includes(key)));
  assert.ok(Object.entries(record).filter(([key]) => !["childs", "blocks_to_delete", "blocks_to_replace"].includes(key)).every(([, value]) => typeof value === "string"));
});

test("PDF reads all supplied lines, supports unnumbered historical invoices, and removes empty tax blocks", () => {
  const record = buildInvoicePdfRecord({ account: {}, transaction: { id: 1, total: 1200 }, person: null, currency: null,
    details: Array.from({ length: 1200 }, (_, id) => ({ id, quantity: 1, net: 1, total: 1 })) });
  assert.equal(record.childs[0].records.length, 1200);
  assert.equal(record.correlative_reference_1, "");
  assert.equal(record.tenant_tax_id, "");
  assert.equal(record.customer_tax_document, "");
  assert.ok(record.blocks_to_delete.includes("tax_bases"));
  assert.equal(amountInWords(999.999), "MIL CON 00/100");
  assert.equal(amountInWords(0), "CERO CON 00/100");
  assert.throws(() => amountInWords(Infinity));
});
