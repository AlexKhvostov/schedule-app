import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { FillOffer } from "../../schedule/fillQueue";
import type { RosterKind } from "../../schedule/rosterPriorities";

export function FillConfirm({ month, queue, offer, actor, busy, onConfirm, onCancel }: {
  month: string; queue: RosterKind; offer: FillOffer; actor: string;
  busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  const date = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month));
  const delegated = actor !== offer.member;
  const skip = offer.mode === "skip";
  const deliveryKey = offer.channel ? "channelDm" : offer.dm ? "dm" : "silent";
  return <dialog ref={dialog} className="v2-fill-confirm" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={title}>{t(`schedule.fill.${skip ? "skipTitle" : delegated ? "forPlayer" : "self"}`, { player: offer.name })}</h2>
    <p className="v2-fill-context">{date} · {t(`schedule.fill.tabs.${queue}`)}</p>
    <p>{skip ? t("schedule.fill.skipBody") : offer.nextName ? t("schedule.fill.next", { player: offer.nextName }) : t("schedule.fill.last")}</p>
    {!skip && offer.nextName && <p>{t(`schedule.fill.${deliveryKey}`, { player: offer.nextName })}</p>}
    <div className="v2-fill-actions">
      <button autoFocus type="button" className="v2-ctrl" disabled={busy} onClick={onCancel}>{t("schedule.fill.cancel")}</button>
      <button type="button" className="v2-ctrl is-primary" disabled={busy} onClick={onConfirm}>{t("schedule.fill.confirm")}</button>
    </div>
  </dialog>;
}
