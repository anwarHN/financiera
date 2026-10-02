import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { callImprent } from "../services/imprentService";
import TextField from "../components/form/TextField";

export default function AccountIntegrationsPage() {
  const { account, user, hasModulePermission } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const generation = useRef(0);
  const accountId = account?.accountId;
  const allowed = Boolean(account?.isOriginalAccount);

  useEffect(() => {
    const version = ++generation.current;
    setState(null); setError(""); setName(""); setFile(null); setBusy(false);
    setIsStatusLoading(Boolean(accountId && allowed));
    if (fileInput.current) fileInput.current.value = "";
    if (accountId && allowed) callImprent({ accountId, action: "status" })
      .then((data) => { if (version === generation.current) setState(data); })
      .catch((err) => { if (version === generation.current) setError(err.message); })
      .finally(() => { if (version === generation.current) setIsStatusLoading(false); });
    return () => { generation.current++; };
  }, [accountId, allowed]);

  const run = async (action, extra = {}) => {
    if (!allowed || !accountId || busy || isStatusLoading) return;
    const version = generation.current;
    setBusy(true); setError("");
    try {
      if (action !== "status") await callImprent({ accountId, action, ...extra });
      const data = await callImprent({ accountId, action: "status" });
      if (version === generation.current) setState(data);
    } catch (err) {
      if (version === generation.current) setError(err.message);
    } finally { if (version === generation.current) setBusy(false); }
  };
  const upload = async (event) => {
    event.preventDefault();
    if (!file || !name.trim()) return;
    const version = generation.current;
    const form = new FormData();
    form.set("accountId", String(accountId)); form.set("action", "upload"); form.set("name", name.trim()); form.set("template", file);
    setBusy(true); setError("");
    try {
      await callImprent(form);
      const data = await callImprent({ accountId, action: "status" });
      if (version === generation.current) {
        setState(data); setName(""); setFile(null); fileInput.current.value = "";
      }
    } catch (err) { if (version === generation.current) setError(err.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const download = async (template) => {
    const version = generation.current;
    setBusy(true); setError("");
    try {
      const blob = await callImprent({ accountId, action: "download-template", templateId: template.id });
      if (version !== generation.current) return;
      if (!(blob instanceof Blob)) throw new Error(t("imprent.invalidFile"));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = template.fileName || "factura.docx"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { if (version === generation.current) setError(err.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  if (!allowed) return <p className="error-text">{t("imprent.ownerOnly")}</p>;
  return <div className="module-page">
    <h1>{t("imprent.integrations")}</h1>
    <section className="generic-panel">
      <h2>Imprent</h2>
      <p>{t("imprent.help")}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {state?.lastError && <p className="error-text">{state.lastError}</p>}
      {isStatusLoading ? <p>{t("common.loading")}</p> : null}
      {!state && !isStatusLoading && <p>{t("imprent.statusUnavailable")}</p>}
      {state && <p>{state.isActive ? t("imprent.active") : t("imprent.inactive")}</p>}
        <p>{t("common.email")}: {state?.settings?.email || user?.email}</p>
        <div className="crud-form-actions">
          <button type="button" disabled={!accountId || busy || isStatusLoading || Boolean(state?.isActive)} onClick={() => {
            if (state?.configured || window.confirm(t("imprent.activationWarning"))) run("activate");
          }}>{busy ? t("common.loading") : t("imprent.activate")}</button>
          <button type="button" className="button-secondary" disabled={busy || isStatusLoading || !state?.isActive} onClick={() => run("disable")}>{t("common.deactivate")}</button>
          {!state && !isStatusLoading && <button type="button" disabled={busy} onClick={() => run("status")}>{t("common.retry")}</button>}
          {hasModulePermission("catalogs", "read") && <Link className="button-link-secondary" to="/invoice-numbering">{t("invoiceNumbering.title")}</Link>}
        </div>
      {state && <>
        <h3>{t("imprent.templates")}</h3>
        <p>{t("imprent.templateHelp")}</p>
        {state.templates.map((template) => <div className="generic-panel" key={template.id}>
          <p>{template.name}{template.isDefault ? ` (${t("imprent.default")})` : ""}</p>
          <div className="crud-form-actions">
            <button type="button" disabled={busy || !state.isActive} onClick={() => download(template)}>{t("imprent.downloadTemplate")}</button>
            <button type="button" disabled={busy || !state.isActive || template.isDefault} onClick={() => run("default", { templateId: template.id })}>{t("imprent.makeDefault")}</button>
            <button type="button" className="button-secondary" disabled={busy || !state.isActive || template.isDefault} onClick={() => run("deactivate-template", { templateId: template.id })}>{t("common.deactivate")}</button>
          </div>
        </div>)}
        <form className="crud-form" onSubmit={upload}>
          <div className="form-grid-2">
            <TextField label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} required disabled={busy || !state.isActive} />
            <label className="field-block"><span>{t("imprent.docx")}</span>
              <input ref={fileInput} type="file" accept=".docx" required disabled={busy || !state.isActive} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <button type="submit" disabled={busy || !state.isActive || !file}>{t("imprent.upload")}</button>
        </form>
      </>}
    </section>
  </div>;
}
