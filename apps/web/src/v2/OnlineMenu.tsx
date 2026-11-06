import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { V2Float } from "./V2Float";
import { centerPos, useWindowPos } from "./windowPos";
import { isLiveData } from "../data/config";
import { loadOnlineMembers, pingMemberPresence, type OnlineMember } from "../data/online";
import { presenceTime, sortOnlineMembers } from "./onlineMembers";
import { PersonAvatar } from "./PersonAvatar";

const REFRESH_MS = 30_000;
const PANEL_WIDTH = 352;

export function OnlineMenu({ memberId, nick, avatarUrl }: { memberId?: string; nick: string; avatarUrl: string | null }) {
  const { t, i18n } = useTranslation();
  const live = isLiveData();
  const [open, setOpen] = useState(false);
  const [pos, move] = useWindowPos("online", () => centerPos(PANEL_WIDTH, 230));
  const [members, setMembers] = useState<OnlineMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showEdits, setShowEdits] = useState(false);

  useEffect(() => {
    if (!live || !memberId) return;
    let interacted = true;
    let sending = false;
    let disposed = false;
    const recordInteraction = () => { interacted = true; };
    const ping = async () => {
      if (sending || disposed) return;
      sending = true;
      const wasActive = interacted;
      interacted = false;
      try {
        if (!await pingMemberPresence(wasActive)) interacted ||= wasActive;
      } catch {
        interacted ||= wasActive;
      } finally {
        sending = false;
      }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), REFRESH_MS);
    window.addEventListener("pointerdown", recordInteraction);
    window.addEventListener("keydown", recordInteraction);
    window.addEventListener("focus", ping);
    window.addEventListener("online", ping);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", recordInteraction);
      window.removeEventListener("keydown", recordInteraction);
      window.removeEventListener("focus", ping);
      window.removeEventListener("online", ping);
    };
  }, [live, memberId]);

  useEffect(() => {
    if (!live || !open) return;
    let disposed = false;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const next = await loadOnlineMembers();
        if (!disposed) {
          setFailed(next === null);
          setMembers(next);
        }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [live, open]);

  const demo: OnlineMember = {
    member_id: "demo", nick, avatar_url: avatarUrl, online: true,
    activity_minutes: 0, edit_minutes: null, edit_variant: null, edit_limit: null,
  };
  const source = live ? members : [demo];
  const rows = source ? sortOnlineMembers(source, i18n.language) : null;
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  const ago = (minutes: number) => {
    const time = presenceTime(minutes);
    return minutes <= 0 ? t("online.justNow") : relative.format(time.amount, time.unit);
  };

  return (
    <>
      <button type="button" className={`v2-nav-link${open ? " is-on" : ""}`} aria-label={t("online.title")} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
        if (open) {
          setOpen(false);
          return;
        }
        setFailed(false);
        setMembers(null);
        setOpen(true);
      }}>
        <i className="fa-solid fa-users" aria-hidden />
        <span>{t("online.title")}</span>
      </button>
      {open && <V2Float
        role="dialog"
        title={t("online.title")}
        x={pos.x}
        y={pos.y}
        width={PANEL_WIDTH}
        z={57}
        compact
        onMove={move}
        onClose={() => setOpen(false)}
        className="v2-online-dialog"
      >
        {failed ? <p role="alert">{t("online.loadError")}</p>
          : !rows ? <p role="status">{t("priorities.loading")}</p>
          : <section className="v2-online-group">
            <div className="v2-online-summary">
              <h3>{t("online.present")} · {rows.filter(row => row.online).length}</h3>
              <span>{t("online.total", { count: rows.length })}</span>
            </div>
            <p className="v2-online-order">{t("online.order")}</p>
            <label className="v2-online-edits-toggle"><input type="checkbox" checked={showEdits} onChange={event => setShowEdits(event.target.checked)} />{t("online.showEdits")}</label>
            {rows.length ? <ul aria-label={t("online.listLabel")}>{rows.map(row => {
              const schedule = row.edit_variant && row.edit_limit
                ? `${row.edit_variant === "nitro" ? "N" : "E"}${row.edit_limit}` : "";
              return <li key={row.member_id} data-presence-member={row.member_id}>
                <PersonAvatar label={row.nick} src={row.avatar_url} size="sm" />
                <div className="v2-online-member">
                  <div className="v2-online-member-line">
                    <strong title={row.nick}>{row.nick}</strong>
                    <span className="v2-online-activity" aria-label={t("online.activity", { time: ago(row.activity_minutes) })}>{ago(row.activity_minutes)}</span>
                  </div>
                  <span className="v2-online-presence" title={t("online.presenceHelp")}>
                    <span aria-hidden className={`v2-online-dot${row.online ? " is-active" : ""}`} />{t(row.online ? "online.connected" : "online.away")}
                  </span>
                  {showEdits && row.edit_minutes !== null && <p className="v2-online-edit-detail">{t(schedule ? "online.editedSchedule" : "online.edited", {
                    time: ago(row.edit_minutes), schedule,
                  })}</p>}
                </div>
              </li>;
            })}</ul> : <p>{t("online.emptyVisitors")}</p>}
          </section>}

      </V2Float>}
    </>
  );
}
