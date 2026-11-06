import { useEffect, useId, useState } from "react";
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
  const [showAway, setShowAway] = useState(false);
  const awayListId = useId();

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
  const present = rows?.filter(row => row.online) ?? [];
  const away = rows?.filter(row => !row.online) ?? [];
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  const ago = (minutes: number) => {
    const time = presenceTime(minutes);
    return minutes <= 0 ? t("online.justNow") : relative.format(time.amount, time.unit);
  };

  const memberList = (group: OnlineMember[], label: string) => <ul aria-label={label}>{group.map(row => {
    const schedule = row.edit_variant && row.edit_limit
      ? `${row.edit_variant === "nitro" ? "N" : "E"}${row.edit_limit}` : "";
    const status = t(row.online ? "online.connected" : "online.away");
    return <li key={row.member_id} data-presence-member={row.member_id}>
      <PersonAvatar label={row.nick} src={row.avatar_url} size="sm" />
      <div className="v2-online-member">
        <div className="v2-online-member-line">
          <span className={`v2-online-dot${row.online ? " is-active" : ""}`} role="img" aria-label={status} title={status} />
          <strong title={row.nick}>{row.nick}</strong>
          <span className="v2-online-activity" title={t("online.presenceHelp")} aria-label={t("online.activity", { time: ago(row.activity_minutes) })}>{ago(row.activity_minutes)}</span>
        </div>
        {showEdits && row.edit_minutes !== null && <p className="v2-online-edit-detail">{t(schedule ? "online.editedSchedule" : "online.edited", {
          time: ago(row.edit_minutes), schedule,
        })}</p>}
      </div>
    </li>;
  })}</ul>;

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
              <h3 title={t("online.presenceHelp")}>{t("online.present")} · {present.length}</h3>
              <label className="v2-online-edits-toggle" title={t("online.showEdits")}><input type="checkbox" aria-label={t("online.showEdits")} checked={showEdits} onChange={event => setShowEdits(event.target.checked)} />{t("online.editsShort")}</label>
            </div>
            {present.length ? memberList(present, t("online.present")) : <p className="v2-online-empty">{t("online.empty")}</p>}
            {away.length > 0 && <>
              <button type="button" className="v2-online-away-toggle" aria-expanded={showAway} aria-controls={awayListId} onClick={() => setShowAway(value => !value)} title={t("online.recentHelp")}>
                <i className={`fa-solid fa-chevron-${showAway ? "down" : "right"}`} aria-hidden />
                <span>{t("online.away")} · {away.length}</span>
              </button>
              <div id={awayListId} hidden={!showAway}>{memberList(away, t("online.away"))}</div>
            </>}
          </section>}

      </V2Float>}
    </>
  );
}
