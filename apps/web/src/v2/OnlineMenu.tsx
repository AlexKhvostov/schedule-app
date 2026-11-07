import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { V2Float } from "./V2Float";
import { centerPos, useWindowPos } from "./windowPos";
import { isLiveData } from "../data/config";
import { getAppConnection, publishAppPresence, subscribeAppConnection, subscribeAppPresence, type AppConnection, type ConnectedMember } from "../data/appRealtime";

const PANEL_WIDTH = 320;

/** The list is a view of connected sessions, not an activity/history query. */
export function OnlineMenu({ memberId, nick }: { memberId?: string; nick: string; avatarUrl: string | null }) {
  const { t, i18n } = useTranslation();
  const live = isLiveData();
  const [open, setOpen] = useState(false);
  const [pos, move] = useWindowPos("online", () => centerPos(PANEL_WIDTH, 230));
  const [members, setMembers] = useState<ConnectedMember[]>([]);
  const [connection, setConnection] = useState<AppConnection>(() => getAppConnection());

  useEffect(() => {
    if (!live || !memberId) return;
    const offConnection = subscribeAppConnection(setConnection);
    const offPresence = subscribeAppPresence(setMembers);
    const stopPublishing = publishAppPresence({ member_id: memberId, nick });
    return () => { stopPublishing(); offPresence(); offConnection(); };
  }, [live, memberId, nick]);

  const connected = !live || connection === "online";
  const source = live ? members : [{ member_id: "demo", nick }];
  const names = new Intl.Collator(i18n.language, { sensitivity: "base", numeric: true });
  const rows = [...source].sort((a, b) => names.compare(a.nick, b.nick) || a.member_id.localeCompare(b.member_id));
  return <>
    <button type="button" className={`v2-nav-link${open ? " is-on" : ""}`} aria-label={t("online.title")} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      <i className="fa-solid fa-users" aria-hidden />
      <span>{t("online.title")}</span>
    </button>
    {open && <V2Float role="dialog" title={t("online.title")} x={pos.x} y={pos.y} width={PANEL_WIDTH} z={57} compact onMove={move} onClose={() => setOpen(false)} className="v2-online-dialog">
      {!connected ? <p role="status">{t(connection === "connecting" ? "online.connectionPending" : "online.connectionLost")}</p>
        : <section className="v2-online-group">
          <div className="v2-online-summary"><h3 title={t("online.connectedHelp")}>{t("online.present")} · {rows.length}</h3></div>
          {rows.length ? <ul aria-label={t("online.present")}>{rows.map(person => <li key={person.member_id} data-presence-member={person.member_id}>
            <span className="v2-online-dot is-active" aria-hidden="true" />
            <strong>{person.nick}</strong>
          </li>)}</ul> : <p className="v2-online-empty">{t("online.empty")}</p>}
        </section>}
    </V2Float>}
  </>;
}
