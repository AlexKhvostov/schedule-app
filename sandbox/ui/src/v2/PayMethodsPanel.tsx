import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { blankPay, clonePays, ensurePresetPays, isPayPreset, loadPays, savePays } from "../data/payments";
import { type PayKind, type PayMethod } from "../schedule/members";
import { showV2Toast } from "./V2Toast";

type Props = {
  memberId?: string | null;
  canEdit: boolean;
  live: boolean;
  demoPays?: PayMethod[];
  seedKey?: string;
  onDemoSave?: (pays: PayMethod[]) => void;
  onSaved?: () => void;
};

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`v2-cab-tick${on ? " is-on" : ""}`} title={label} aria-label={label} aria-pressed={on} onClick={onClick}>
      {on ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="v2-cab-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function KindHead({
  kind,
  primary,
  canEdit,
  onPrimary,
}: {
  kind: PayKind;
  primary: boolean;
  canEdit: boolean;
  onPrimary: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="v2-cab-pay-kind">
      <div className="v2-cab-pay-kind-name">
        <b>{t(`cabinet.payKind.${kind === "skrill" ? "skrill" : "usdt"}`)}</b>
        {kind === "usdt_trc20" ? <small>{t("cabinet.payKind.usdtNet")}</small> : null}
      </div>
      <label className="v2-cab-check v2-cab-pay-main">
        <Tick on={primary} label={t("cabinet.payMain")} onClick={() => canEdit && onPrimary()} />
        {t("cabinet.payMain")}
      </label>
    </div>
  );
}

function BlockBar({
  dirty,
  extra,
  saveLabel,
  cancelLabel,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  extra?: ReactNode;
  saveLabel: string;
  cancelLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`v2-cab-foot${extra ? " is-split" : ""}`}>
      {extra ? <div className="v2-cab-foot-extra">{extra}</div> : <span />}
      <div className="v2-cab-foot-act">
        {dirty ? (
          <button type="button" className="v2-cab-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
        <button type="button" className={`v2-ctrl v2-save px-3${dirty ? " is-dirty" : ""}`} disabled={!dirty} onClick={onSave}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

export function PayMethodsPanel({ memberId, canEdit, live, demoPays, seedKey, onDemoSave, onSaved }: Props) {
  const { t } = useTranslation();
  const [pays, setPays] = useState<PayMethod[]>(() => ensurePresetPays(demoPays ?? []));
  const [savedPays, setSavedPays] = useState<PayMethod[]>(() => ensurePresetPays(demoPays ?? []));
  const [newPay, setNewPay] = useState<PayMethod | null>(null);
  const [ready, setReady] = useState(!live || !memberId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!live || !memberId) {
      const seed = ensurePresetPays(demoPays ?? []);
      setPays(clonePays(seed));
      setSavedPays(clonePays(seed));
      setNewPay(null);
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    void loadPays(memberId).then((rows) => {
      if (!alive) return;
      const next = ensurePresetPays(rows);
      setPays(clonePays(next));
      setSavedPays(clonePays(next));
      setNewPay(null);
      setReady(true);
    });
    return () => {
      alive = false;
    };
    // demoPays is a snapshot for the demo sandbox; live path always reloads from Postgres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, memberId, seedKey]);

  const persist = async (next: PayMethod[]) => {
    if (busy) return;
    const cleaned = ensurePresetPays(next);
    setBusy(true);
    if (live && memberId) {
      const result = await savePays(memberId, cleaned);
      setBusy(false);
      if (result.error) {
        showV2Toast("err", t("cabinet.saveErr"));
        return;
      }
      setPays(clonePays(result.pays));
      setSavedPays(clonePays(result.pays));
      setNewPay(null);
      showV2Toast("ok", t("cabinet.saved"));
      onSaved?.();
      return;
    }
    onDemoSave?.(cleaned);
    setPays(clonePays(cleaned));
    setSavedPays(clonePays(cleaned));
    setNewPay(null);
    setBusy(false);
    showV2Toast("ok", t("cabinet.saved"));
    onSaved?.();
  };

  const setPay = (id: string, part: Partial<PayMethod>) => {
    setPays((prev) =>
      prev.map((row) => {
        if (row.id !== id) return part.primary ? { ...row, primary: false } : row;
        return { ...row, ...part };
      }),
    );
  };

  const detailsPh = (kind?: PayKind) => {
    if (kind === "usdt_trc20") return t("cabinet.payDetailsPhUsdt");
    if (kind === "skrill") return t("cabinet.payDetailsPhSkrill");
    return t("cabinet.payDetailsPh");
  };

  const dirty = !sameJson(pays, savedPays);
  const presets = pays.filter((row) => isPayPreset(row.kind));
  const extras = pays.filter((row) => !isPayPreset(row.kind));

  return (
    <section className="v2-block v2-cab-card">
      <div className="v2-cab-head">
        <h2>{t("cabinet.payTitle")}</h2>
      </div>
      <div className="v2-cab-body">
        <p className="v2-cab-hint">{t("cabinet.payLead")}</p>
        {!memberId && live ? <p className="v2-cab-hint">{t("cabinet.payNeedCard")}</p> : null}
        {!ready ? <p className="v2-cab-hint">{t("cabinet.payLoading")}</p> : null}
        {ready
          ? presets.map((row) => (
              <div key={row.id} className={`v2-cab-pay is-preset${row.primary ? " is-main" : ""}`}>
                <KindHead kind={row.kind ?? "custom"} primary={row.primary} canEdit={canEdit} onPrimary={() => setPay(row.id, { primary: true })} />
                <div className="v2-cab-pay-grid is-preset">
                  <Field label={t("cabinet.payDetails")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      placeholder={detailsPh(row.kind)}
                      value={row.details}
                      onChange={(event) => setPay(row.id, { details: event.target.value })}
                    />
                  </Field>
                  <Field label={t("cabinet.payComment")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      placeholder={t("cabinet.payCommentPh")}
                      value={row.comment}
                      onChange={(event) => setPay(row.id, { comment: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))
          : null}
        {ready
          ? extras.map((row) => (
              <div key={row.id} className={`v2-cab-pay${row.primary ? " is-main" : ""}`}>
                <div className="v2-cab-pay-grid">
                  <Field label={t("cabinet.payName")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      placeholder={t("cabinet.payNamePh")}
                      value={row.title}
                      onChange={(event) => setPay(row.id, { title: event.target.value })}
                    />
                  </Field>
                  <Field label={t("cabinet.payDetails")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      placeholder={t("cabinet.payDetailsPh")}
                      value={row.details}
                      onChange={(event) => setPay(row.id, { details: event.target.value })}
                    />
                  </Field>
                  <Field label={t("cabinet.payComment")}>
                    <input
                      className="v2-ctrl w-full px-2"
                      disabled={!canEdit}
                      placeholder={t("cabinet.payCommentPh")}
                      value={row.comment}
                      onChange={(event) => setPay(row.id, { comment: event.target.value })}
                    />
                  </Field>
                  <label className="v2-cab-check v2-cab-pay-main">
                    <Tick on={row.primary} label={t("cabinet.payMain")} onClick={() => canEdit && setPay(row.id, { primary: true })} />
                    {t("cabinet.payMain")}
                  </label>
                </div>
                {canEdit ? (
                  <div className="v2-cab-pay-drop">
                    <button
                      type="button"
                      className="v2-cab-ghost"
                      disabled={busy}
                      onClick={() => void persist(pays.filter((item) => item.id !== row.id))}
                    >
                      {t("cabinet.payRemove")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          : null}
        {newPay ? (
          <div className="v2-cab-pay is-new">
            <div className="v2-cab-pay-grid">
              <Field label={t("cabinet.payName")}>
                <input
                  className="v2-ctrl w-full px-2"
                  placeholder={t("cabinet.payNamePh")}
                  value={newPay.title}
                  onChange={(event) => setNewPay({ ...newPay, title: event.target.value })}
                />
              </Field>
              <Field label={t("cabinet.payDetails")}>
                <input
                  className="v2-ctrl w-full px-2"
                  placeholder={t("cabinet.payDetailsPh")}
                  value={newPay.details}
                  onChange={(event) => setNewPay({ ...newPay, details: event.target.value })}
                />
              </Field>
              <Field label={t("cabinet.payComment")}>
                <input
                  className="v2-ctrl w-full px-2"
                  placeholder={t("cabinet.payCommentPh")}
                  value={newPay.comment}
                  onChange={(event) => setNewPay({ ...newPay, comment: event.target.value })}
                />
              </Field>
              <label className="v2-cab-check v2-cab-pay-main">
                <Tick on={newPay.primary} label={t("cabinet.payMain")} onClick={() => setNewPay({ ...newPay, primary: !newPay.primary })} />
                {t("cabinet.payMain")}
              </label>
            </div>
            <BlockBar
              dirty={Boolean(newPay.title.trim() || newPay.details.trim())}
              saveLabel={t("cabinet.save")}
              cancelLabel={t("cabinet.cancel")}
              onSave={() => {
                const row = {
                  ...newPay,
                  kind: "custom" as const,
                  title: newPay.title.trim(),
                  details: newPay.details.trim(),
                  comment: newPay.comment.trim(),
                };
                if (!row.title && !row.details) return;
                const next = [...pays.map((item) => ({ ...item, primary: row.primary ? false : item.primary })), row];
                void persist(next);
              }}
              onCancel={() => setNewPay(null)}
            />
          </div>
        ) : canEdit && (!live || memberId) ? (
          <button type="button" className="v2-cab-add" disabled={busy} onClick={() => setNewPay(blankPay(false))}>
            {t("cabinet.payAdd")}
          </button>
        ) : null}
        {ready && canEdit && (!live || memberId) ? (
          <BlockBar
            dirty={dirty}
            saveLabel={t("cabinet.save")}
            cancelLabel={t("cabinet.cancel")}
            onSave={() => void persist(pays)}
            onCancel={() => {
              setPays(clonePays(savedPays));
              setNewPay(null);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
