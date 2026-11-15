import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { accessIssueSnapshot, dismissAccessIssue, subscribeAccessIssues } from "../data/accessIssues";

// Critical inline styling also works above the boot screen before v2.css arrives.
const styles = `.v2-access-alert{position:fixed;z-index:100000;inset:auto;top:8px;left:50%;margin:0;transform:translateX(-50%);box-sizing:border-box;width:min(560px,calc(100% - 16px));max-height:calc(100dvh - 16px);overflow-y:auto;padding:9px 11px;display:flex;align-items:flex-start;gap:10px;border:1px solid var(--destructive,#f87171);border-radius:7px;background:var(--card,#151a24);color:var(--foreground,#f4f5f7);box-shadow:0 3px 12px #0003;font:12px/1.4 system-ui,sans-serif}.v2-access-alert-copy{flex:1;min-width:0;display:grid;gap:3px}.v2-access-alert p{margin:0}.v2-access-alert small{overflow-wrap:anywhere;color:var(--muted-foreground,#9ca3af);font-size:10px}.v2-access-alert button{border:1px solid var(--border,#293041);border-radius:4px;background:transparent;color:inherit;padding:2px 6px;font:inherit;cursor:pointer}.v2-access-alert-actions{display:flex;gap:5px;flex-shrink:0}.v2-access-alert-close{font-size:16px!important;line-height:18px!important}`;

export function AccessIssueBanner() {
  const issue = useSyncExternalStore(subscribeAccessIssues, accessIssueSnapshot, () => null);
  const { t } = useTranslation();
  const [copied, setCopied] = useState("");
  const [copyFailed, setCopyFailed] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!issue) { setHost(null); return; }
    // Native modal dialogs make the rest of the document inert. Keep the
    // alert inside the current dialog and move it back when that dialog closes.
    const relocate = () => setHost([...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1) ?? document.body);
    relocate();
    const observer = new MutationObserver(relocate);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [issue]);
  useEffect(() => {
    const node = banner.current;
    if (issue && node && !node.matches(":popover-open")) node.showPopover?.();
    return () => { if (node?.matches(":popover-open")) node.hidePopover(); };
  }, [issue, host]);
  if (!issue || !host) return null;
  const details = `${issue.code} · ${issue.operation} · ${issue.at}${issue.requestId ? ` · ${issue.requestId}` : ""}`;
  const copyDetails = async () => {
    try { await navigator.clipboard.writeText(details); setCopied(details); setCopyFailed(""); }
    catch { setCopyFailed(details); }
  };
  return createPortal(<>
    <style>{styles}</style>
    <div ref={banner} popover="manual" className="v2-access-alert" role="alert">
      <div className="v2-access-alert-copy">
        <b>{t(`accessAlert.${issue.kind}Title`)}</b>
        <p>{t(`accessAlert.${issue.kind}`)}</p>
        <small>{t("accessAlert.details", { details })}</small>
        {copyFailed === details && <small>{t("accessAlert.copyFailed")}</small>}
      </div>
      <div className="v2-access-alert-actions">
        <button type="button" onClick={() => void copyDetails()}>{t(copied === details ? "accessAlert.copied" : "accessAlert.copy")}</button>
        <button type="button" className="v2-access-alert-close" aria-label={t("accessAlert.close")} onClick={dismissAccessIssue}>×</button>
      </div>
    </div>
  </>, host);
}
