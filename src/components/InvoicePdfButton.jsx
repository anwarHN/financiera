import { useEffect, useRef, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { callImprent, generateInvoicePdf } from "../services/imprentService";

export default function InvoicePdfButton({ accountId, transactionId, isActive }) {
  const { t } = useI18n();
  const [options, setOptions] = useState(null);
  const [templateId, setTemplateId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    setOptions(null); setError(""); setOpen(false); setUrl(""); setBusy(false); setTemplateId("");
    if (accountId) callImprent({ accountId, action: "print-options" }).then((data) => {
      if (version !== generation.current) return;
      setOptions(data);
      setTemplateId(String((data.templates.find((item) => item.isDefault) || data.templates[0])?.id || ""));
    }).catch((err) => { if (version === generation.current) setError(err.message); });
    return () => { generation.current++; };
  }, [accountId, transactionId]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const generate = async () => {
    const version = generation.current;
    setBusy(true); setError(""); setUrl("");
    try {
      const blob = await generateInvoicePdf({ accountId, transactionId, templateId: Number(templateId) });
      if (version === generation.current) setUrl(URL.createObjectURL(blob));
    } catch (err) { if (version === generation.current) setError(err.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const ready = isActive && options?.isActive && options.templates.length > 0;
  return <>
    <button type="button" className="button-link-secondary" disabled={!ready}
      title={error || (!isActive ? t("imprent.voidInvoice") : !ready ? t("imprent.configureFirst") : t("imprent.pdf"))}
      onClick={() => setOpen(true)}>{t("imprent.pdf")}</button>
    {open && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label={t("imprent.pdf")}>
      <h3>{t("imprent.pdf")}</h3>
      {error && <p role="alert" className="error-text">{error}</p>}
      <label className="field-block"><span>{t("imprent.template")}</span>
        <select value={templateId} disabled={busy} onChange={(e) => { setTemplateId(e.target.value); setUrl(""); }}>
          {options.templates.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isDefault ? ` (${t("imprent.default")})` : ""}</option>)}
        </select>
      </label>
      <p>{t("imprent.printHelp")}</p>
      <div className="crud-form-actions">
        <button type="button" onClick={generate} disabled={busy || !templateId}>{busy ? t("common.loading") : t("imprent.generate")}</button>
        {url && <>
          <a className="button-link-primary" href={url} target="_blank" rel="noopener noreferrer">{t("imprent.openPrint")}</a>
          <a className="button-link-secondary" href={url} download={`factura-${transactionId}.pdf`}>{t("imprent.downloadPdf")}</a>
        </>}
        <button type="button" className="button-secondary" disabled={busy} onClick={() => { setOpen(false); setUrl(""); }}>{t("common.close")}</button>
      </div>
    </section></div>}
  </>;
}
