import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "@/components/ui/dialog";
import { isLiveData } from "../data/config";
import { loadOnlineMembers, pingMemberPresence, type OnlineMember } from "../data/online";
import { PersonAvatar } from "./PersonAvatar";

const REFRESH_MS = 30_000;

export function OnlineMenu({ memberId, nick, avatarUrl }: { memberId?: string; nick: string; avatarUrl: string | null }) {
  const { t, i18n } = useTranslation();
  const live = isLiveData();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OnlineMember[] | null>(null);
  const [failed, setFailed] = useState(false);

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
  const rows = live ? members : [demo];
  const relative = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  const ago = (minutes: number) => minutes <= 0 ? t("online.justNow")
    : minutes < 60 ? relative.format(-minutes, "minute") : relative.format(-Math.floor(minutes / 60), "hour");

  return (
    <>
      <button type="button" className={`v2-nav-link${open ? " is-on" : ""}`} aria-label={t("online.title")} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
        setFailed(false);
        setMembers(null);
        setOpen(true);
      }}>
        <i className="fa-solid fa-users" aria-hidden />
        <span>{t("online.title")}</span>
      </button>
      <Dialog open={open} title={t("online.title")} onClose={() => setOpen(false)} className="v2-online-dialog">
        {failed ? <p role="alert">{t("online.loadError")}</p>
          : !rows ? <p role="status">{t("priorities.loading")}</p>
          : ([true, false] as const).map((online) => {
            const group = rows.filter((row) => row.online === online);
            if (!online && !group.length) return null;
            return <section className="v2-online-group" key={String(online)}>
              <h3>{t(online ? "online.present" : "online.recent")} · {group.length}</h3>
              {group.length ? <ul>{group.map((row) => {
                const tone = row.activity_minutes < 20 ? "active" : row.activity_minutes < 40 ? "idle" : "quiet";
                const schedule = row.edit_variant && row.edit_limit
                  ? `${row.edit_variant === "nitro" ? "N" : "E"}${row.edit_limit}` : "";
                return <li key={row.member_id}>
                  <PersonAvatar label={row.nick} src={row.avatar_url} size="sm" />
                  <div className="v2-online-member">
                    <div className="v2-online-member-line">
                      <strong title={row.nick}>{row.nick}</strong>
                      <span className="v2-online-activity" aria-label={t("online.activity", { time: ago(row.activity_minutes) })}>
                        <span aria-hidden className={`v2-online-dot is-${tone}`} />{ago(row.activity_minutes)}
                      </span>
                    </div>
                    {row.edit_minutes !== null && <p>{t(schedule ? "online.editedSchedule" : "online.edited", {
                      time: ago(row.edit_minutes), schedule,
                    })}</p>}
                  </div>
                </li>;
              })}</ul> : <p>{t("online.empty")}</p>}
            </section>;
          })}
      </Dialog>
    </>
  );
}
