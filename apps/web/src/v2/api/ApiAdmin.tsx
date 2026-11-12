import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { apiClientStatus, createApiClient, externalApiEndpoint, generateApiCredential, listApiClients, revokeApiClient, type ApiClient, type ApiCredential, type ApiClientDraft } from "../../data/externalApi";
import { isLiveData } from "../../data/config";
import { ApiExamples, apiExamplesText } from "./ApiExamples";
import "./api.css";

function ApiModal({ title, children, onClose, canClose = true }: { title: string; children: ReactNode; onClose: () => void; canClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="v2-api-modal" aria-label={title} onCancel={(event) => { event.preventDefault(); if (canClose) onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="v2-ctrl" disabled={!canClose} onClick={onClose} aria-label={t("apiAdmin.close")}>✕</button></header>
    {children}
  </dialog>;
}

export function ApiAdmin() {
  const { t, i18n } = useTranslation();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"owner" | "create" | "secret" | "guide" | "revoke" | null>(null);
  const [selected, setSelected] = useState<ApiClient | null>(null);
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [validity, setValidity] = useState("90");
  const [rpm, setRpm] = useState("60");
  const [version, setVersion] = useState<1 | 2>(2);
  const pending = useRef<{ credential: ApiCredential; draft: ApiClientDraft } | null>(null);
  const requestLock = useRef(false);
  const endpoint = externalApiEndpoint(version);
  const live = isLiveData();
  const formatDate = (date: string | null) => date ? new Date(date).toLocaleString(i18n.language, { timeZoneName: "short" }) : t("apiAdmin.unlimited");
  const guideIntro = selected ? t(`apiAdmin.${version === 2 ? "developerTextV2" : "developerText"}`, { name: selected.name, endpoint, rpm: selected.requests_per_minute, expiry: formatDate(selected.expires_at), interpolation: { escapeValue: false } }) : "";
  const examplesText = apiExamplesText(endpoint, t, version);
  const guide = `${guideIntro}\n\n${examplesText}`;
  const ownerGuide = `${t("apiAdmin.ownerText")}\n\n${examplesText}`;

  const refresh = async () => {
    setLoading(true); setError("");
    try { setClients(await listApiClients()); setLoaded(true); } catch { setLoaded(false); setError("loadError"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const close = () => { if (busy) return; setModal(null); setSecret(""); setNotice(""); setError(""); pending.current = null; };
  const open = (next: typeof modal, client: ApiClient | null = null) => { setSelected(client); setVersion(client?.guide_version ?? (client ? 1 : 2)); setError(""); setNotice(""); setModal(next); };
  const versionPicker = <label className="v2-api-version">{t("apiAdmin.version")}<select className="v2-ctrl" value={version} onChange={(event) => { setVersion(Number(event.target.value) as 1 | 2); setNotice(""); }}><option value={2}>{t("apiAdmin.version2")}</option><option value={1}>{t("apiAdmin.version1")}</option></select></label>;
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setNotice("copied"); } catch { setNotice("copyError"); }
  };
  const create = async () => {
    if (!loaded || requestLock.current) return;
    requestLock.current = true; setBusy(true); setError("");
    try {
      if (!pending.current) pending.current = {
        credential: await generateApiCredential(),
        draft: { name: name.trim(), contact: contact.trim(), notes: notes.trim(), guide_version: version, requests_per_minute: Number(rpm), expires_at: validity === "0" ? null : new Date(Date.now() + Number(validity) * 86_400_000).toISOString() },
      };
      const row = await createApiClient(pending.current.draft, pending.current.credential);
      setClients((rows) => [row, ...rows.filter((item) => item.id !== row.id)]);
      setSelected(row); setVersion(row.guide_version ?? 1); setSecret(pending.current.credential.key); pending.current = null;
      setSaved(false); setModal("secret"); setName(""); setContact(""); setNotes("");
    } catch { setError("saveError"); }
    finally { setBusy(false); requestLock.current = false; }
  };
  const revoke = async () => {
    if (!selected || requestLock.current) return;
    requestLock.current = true; setBusy(true); setError("");
    try { const row = await revokeApiClient(selected.id); setClients((rows) => rows.map((item) => item.id === row.id ? row : item)); setModal(null); }
    catch { setError("error"); }
    finally { setBusy(false); requestLock.current = false; }
  };
  return <div className="v2-api">
    <header className="v2-api-head"><div><span className="v2-admin-kicker">Root</span><h1>{t("apiAdmin.title")}</h1><p>{t("apiAdmin.lead")}</p></div>
      <div className="v2-api-actions"><button className="v2-ctrl" onClick={() => open("owner")}>{t("apiAdmin.ownerGuide")}</button><button className="v2-ctrl v2-primary-action" disabled={loading} onClick={() => open("create")}>{t("apiAdmin.create")}</button></div>
    </header>
    {!live && <p className="v2-api-banner">{t("apiAdmin.demo")}</p>}
    <section className="v2-api-endpoint"><b>{t("apiAdmin.endpoint")}</b><code>{externalApiEndpoint(2)}</code><p>{t("apiAdmin.availability")}</p><small>{t("apiAdmin.scope")}</small></section>
    <div className="v2-api-actions"><button className="v2-ctrl" disabled={loading} onClick={() => void refresh()}>{t("apiAdmin.refresh")}</button><span>{clients.length}</span></div>
    {!modal && error && <p role="alert">{t(`apiAdmin.${error}`)}</p>}
    {loading ? <p role="status">{t("apiAdmin.loading")}</p> : !clients.length && !error ? <p className="v2-api-empty">{t("apiAdmin.empty")}</p> : null}
    <div className="v2-api-clients">{clients.map((client) => <article className="v2-api-client" key={client.id}>
      <header><h2>{client.name} <small>v{client.guide_version ?? 1}</small></h2><span className={`v2-api-status is-${apiClientStatus(client)}`}>{t(`apiAdmin.${apiClientStatus(client)}`)}</span></header>
      {client.contact && <p>{client.contact}</p>}{client.notes && <p className="v2-api-notes">{client.notes}</p>}
      <dl><div><dt>{t("apiAdmin.createdAt")}</dt><dd>{formatDate(client.created_at)}</dd></div><div><dt>{t("apiAdmin.expiresAt")}</dt><dd>{formatDate(client.expires_at)}</dd></div><div><dt>{t("apiAdmin.rpm")}</dt><dd>{client.requests_per_minute}</dd></div></dl>
      <div className="v2-api-actions"><button className="v2-ctrl" onClick={() => open("guide", client)}>{t("apiAdmin.developerGuide")}</button><button className="v2-ctrl v2-api-danger" disabled={!!client.revoked_at} onClick={() => open("revoke", client)}>{t("apiAdmin.revoke")}</button></div>
    </article>)}</div>
    {modal && <ApiModal title={t(`apiAdmin.${modal === "owner" ? "ownerGuide" : modal === "guide" ? "developerGuide" : modal === "secret" ? "created" : modal === "revoke" ? "revokeTitle" : "create"}`)} onClose={close} canClose={!busy && (modal !== "secret" || saved)}>
      {modal === "create" && <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
        {!loaded && <p role="status">{t("apiAdmin.previewOnly")}</p>}
        <fieldset disabled={busy || !!pending.current} className="v2-api-form">
          {versionPicker}<small>{t("apiAdmin.versionHint")}</small>
          <label>{t("apiAdmin.name")}<input className="v2-ctrl" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>{t("apiAdmin.contact")}<input className="v2-ctrl" maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} /></label>
          <label>{t("apiAdmin.notes")}<textarea className="v2-ctrl" maxLength={1000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <label>{t("apiAdmin.validity")}<select className="v2-ctrl" value={validity} onChange={(event) => setValidity(event.target.value)}>{[30, 90, 365, 0].map((days) => <option key={days} value={days}>{days ? t("apiAdmin.days", { count: days }) : t("apiAdmin.unlimited")}</option>)}</select></label>
          <label>{t("apiAdmin.rpm")}<input className="v2-ctrl" type="number" min={1} max={600} step={1} required value={rpm} onChange={(event) => setRpm(event.target.value)} /></label>
        </fieldset><p>{t("apiAdmin.scope")}</p><button className="v2-ctrl v2-primary-action" disabled={busy || !loaded || !name.trim()} type="submit">{busy ? "…" : t("apiAdmin.create")}</button>
      </form>}
      {modal === "owner" && <>{versionPicker}<div className="v2-api-instructions">{t("apiAdmin.ownerText")}</div><ApiExamples endpoint={endpoint} version={version} /><button className="v2-ctrl" onClick={() => void copy(ownerGuide)}>{t("apiAdmin.copy")}</button></>}
      {modal === "guide" && <>{versionPicker}<div className="v2-api-instructions">{guideIntro}</div><ApiExamples endpoint={endpoint} version={version} /><button className="v2-ctrl" onClick={() => void copy(guide)}>{t("apiAdmin.copy")}</button></>}
      {modal === "secret" && <><p>{t("apiAdmin.once")}</p>{!live && <p className="v2-api-banner">{t("apiAdmin.demo")}</p>}<div className="v2-api-secret"><label htmlFor="api-created-key">{t("apiAdmin.secret")}</label><textarea id="api-created-key" readOnly autoComplete="off" spellCheck={false} rows={3} value={secret} /></div>
        <p>{t("apiAdmin.version")}: v{version}</p><div className="v2-api-actions"><button className="v2-ctrl" onClick={() => void copy(secret)}>{t("apiAdmin.copyKey")}</button><button className="v2-ctrl" onClick={() => void copy(guide.replaceAll("<API_KEY>", secret))}>{t("apiAdmin.copyBundle")}</button></div>
        <label className="v2-api-ack"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />{t("apiAdmin.saved")}</label><button className="v2-ctrl" disabled={!saved} onClick={close}>{t("apiAdmin.close")}</button></>}
      {modal === "revoke" && <><p>{t("apiAdmin.revokeText", { name: selected?.name })}</p><div className="v2-api-actions"><button className="v2-ctrl" disabled={busy} onClick={close}>{t("apiAdmin.cancel")}</button><button className="v2-ctrl v2-api-danger" disabled={busy} onClick={() => void revoke()}>{t("apiAdmin.revoke")}</button></div></>}
      {error && <p role="alert">{t(`apiAdmin.${error}`)}</p>}{notice && <p role="status">{t(`apiAdmin.${notice}`)}</p>}
    </ApiModal>}
  </div>;
}
