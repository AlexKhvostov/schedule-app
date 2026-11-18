import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FillOffer } from "../../schedule/fillQueue";
import type { RosterKind } from "../../schedule/rosterPriorities";
import { PersonChip } from "../PersonAvatar";

export type FillConfirmContent = { offer: FillOffer } | { notice: "waiting" | "outside" | "unavailable"; player: string };

export function FillConfirm({ month, queue, content, actor, finisherAvatar, nextAvatar, busy, onConfirm, onCancel }: {
  month: string; queue: RosterKind; content: FillConfirmContent; actor: string;
  finisherAvatar?: string;
  nextAvatar?: string;
  busy: boolean; onConfirm: (notify: boolean) => void; onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [notify, setNotify] = useState(true);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const date = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month));
  const offer = "offer" in content ? content.offer : null;
  const completion = offer?.mode === "complete" ? offer : null;
  const skip = offer?.mode === "skip";
  const nextName = completion?.nextName;
  const canNotify = Boolean(nextName && completion?.dm);
  const willNotify = canNotify && notify;
  const deliveryKey = canNotify ? (notify ? (completion?.channel ? "channelDm" : "dm") : "silentThisTurn")
    : nextName ? "silent" : "last";
  const heading = "notice" in content
    ? t(`schedule.fill.notices.${content.notice}.title`, { player: content.player })
    : skip ? t("schedule.fill.skipTitle", { player: content.offer.name }) : t("schedule.fill.finishTitle");
  const details = "notice" in content
    ? t(`schedule.fill.notices.${content.notice}.body`)
    : t("schedule.fill.skipBody");
  const icon = offer ? (skip ? "fa-forward-step" : "fa-flag-checkered") : "fa-circle-info";
  return <dialog ref={dialog} className="v2-alarm v2-fill-confirm" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <header className="v2-alarm-head">
      <span className="v2-alarm-ico" aria-hidden><i className={`fa-solid ${icon}`} /></span>
      <div className="v2-alarm-titles">
        <span className="v2-alarm-kicker">{t(`schedule.fill.tabs.${queue}`)} · {date}</span>
        <h2 id={title}>{heading}</h2>
      </div>
    </header>
    {completion ? <>
      <div className={`v2-fill-handoff${nextName ? " has-next" : ""}`}>
        <div className="v2-alarm-impact v2-fill-player" role="group" aria-labelledby={`${title}-finisher`}>
          <span id={`${title}-finisher`}>{t("schedule.fill.finisher")}</span>
          <PersonChip src={finisherAvatar} name={completion.name} size="sm" />
        </div>
        {nextName && <>
          <i className="fa-solid fa-arrow-right v2-fill-arrow" aria-hidden />
          <div className="v2-alarm-impact v2-fill-player is-next" role="group" aria-labelledby={`${title}-next`}>
            <span id={`${title}-next`}>{t("schedule.fill.next")}</span>
            <PersonChip src={nextAvatar} name={nextName} size="sm" />
          </div>
        </>}
      </div>
      {actor !== completion.member && <p className="v2-fill-delegated">{t("schedule.fill.delegated")}</p>}
      <div className={`v2-alarm-notice v2-fill-delivery${willNotify ? "" : " is-silent"}`}>
        <i className={`fa-solid ${willNotify ? "fa-bell" : "fa-bell-slash"}`} aria-hidden />
        <div>
          <strong>{t(willNotify ? "schedule.fill.deliveryPlanned" : "schedule.fill.deliveryNone")}</strong>
          <span>{t(`schedule.fill.${deliveryKey}`)}</span>
          {canNotify && <label className="v2-fill-notify">
            <input type="checkbox" checked={notify} disabled={busy} onChange={event => setNotify(event.target.checked)} />
            {t("schedule.fill.notify")}
          </label>}
        </div>
      </div>
    </> : <div className="v2-alarm-impact v2-fill-impact">{details}</div>}
    <div className="v2-alarm-actions v2-fill-actions">
      <button autoFocus type="button" className="v2-alarm-no" disabled={busy} onClick={onCancel}>
        {t(offer ? "schedule.fill.cancel" : "schedule.close")}
      </button>
      {offer && <button type="button" className="v2-alarm-alt" disabled={busy} onClick={() => onConfirm(willNotify)}>
        <i className="fa-solid fa-check" aria-hidden />
        {t("schedule.fill.confirm")}
      </button>}
    </div>
  </dialog>;
}
