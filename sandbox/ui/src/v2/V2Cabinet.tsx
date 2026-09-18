import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { UTC_OFFSETS, utcLabel } from "../schedule/cet";
import {
  emptyPay,
  loadMembers,
  memberBg,
  memberFg,
  memberOfSession,
  saveMembers,
  type ClubMember,
  type CommunityKind,
  type PayMethod,
  type RoomPlay,
} from "../schedule/members";
import { ROOM_OPTIONS, emptyRoomPlay, roomName } from "../schedule/rooms";
import { loadDiscordOrg } from "./discordOrg";
import { loadPrefs, savePrefs } from "./prefs";
import type { Session } from "./session";
import { R } from "./tokens";

type Props = {
  session: Session;
  onSent: () => void;
  onLogout: () => void;
};

type ProfileDraft = {
  name: string;
  birthday: string;
  city: string;
  country: string;
  phone: string;
  telegram: string;
  showExtraTz: boolean;
  extraUtc: number;
};

type LoginDraft = {
  email: string;
  google: string;
  password: string;
};

function packProfile(row: ClubMember | undefined, nick: string): ProfileDraft {
  return {
    name: row?.name || nick,
    birthday: row?.birthday ?? "",
    city: row?.city ?? "",
    country: row?.country ?? "",
    phone: row?.phone ?? "",
    telegram: row?.telegram ?? "",
    showExtraTz: row?.showExtraTz === true,
    extraUtc: row?.extraUtc ?? 3,
  };
}

function packLogin(row: ClubMember | undefined): LoginDraft {
  return { email: row?.email ?? "", google: row?.google ?? "", password: "" };
}

function clonePlays(list: RoomPlay[] | undefined): RoomPlay[] {
  return (list ?? []).map((row) => ({
    ...row,
    limits: [...row.limits],
    kinds: [...row.kinds],
    nickHistory: (row.nickHistory ?? []).map((stamp) => ({ ...stamp })),
  }));
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Pencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function Floppy() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="v2-cab-fact">
      <span>{label}</span>
      <b>{children}</b>
    </div>
  );
}

function EditSave({
  editing,
  dirty,
  titleEdit,
  titleSave,
  onEdit,
  onSave,
}: {
  editing: boolean;
  dirty: boolean;
  titleEdit: string;
  titleSave: string;
  onEdit: () => void;
  onSave: () => void;
}) {
  if (!editing) {
    return (
      <button type="button" className="v2-cab-ico" title={titleEdit} aria-label={titleEdit} onClick={onEdit}>
        <Pencil />
      </button>
    );
  }
  return (
    <button type="button" className={`v2-cab-ico${dirty ? " is-on" : ""}`} title={titleSave} aria-label={titleSave} disabled={!dirty} onClick={onSave}>
      <Floppy />
    </button>
  );
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="v2-cab-field">
      <span>{label}</span>
      {children}
      {hint ? <small className="v2-cab-hint">{hint}</small> : null}
    </label>
  );
}

function Chip({ on, children, onClick, disabled }: { on: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`v2-ctrl v2-cab-chip${on ? " is-on" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function V2Cabinet({ session, onSent, onLogout }: Props) {
  const { t } = useTranslation();
  const org = loadDiscordOrg();
  const [list, setList] = useState(() => loadMembers());
  const mine = useMemo(() => memberOfSession(list, session), [list, session]);
  const waiting = session.access !== "active";

  const [profile, setProfile] = useState(() => packProfile(mine, session.nick));
  const [savedProfile, setSavedProfile] = useState(() => packProfile(mine, session.nick));
  const [login, setLogin] = useState(() => packLogin(mine));
  const [savedLogin, setSavedLogin] = useState(() => packLogin(mine));
  const [plays, setPlays] = useState(() => clonePlays(mine?.plays));
  const [savedPlays, setSavedPlays] = useState(() => clonePlays(mine?.plays));
  const [pays, setPays] = useState<PayMethod[]>(() => (mine?.pays ?? []).map((row) => ({ ...row })));
  const [savedPays, setSavedPays] = useState<PayMethod[]>(() => (mine?.pays ?? []).map((row) => ({ ...row })));
  const [prefs, setPrefs] = useState(loadPrefs);
  const [savedPrefs, setSavedPrefs] = useState(loadPrefs);
  const [editProfile, setEditProfile] = useState(false);
  const [editLogin, setEditLogin] = useState(false);
  const [editPayId, setEditPayId] = useState("");
  const [newPay, setNewPay] = useState<PayMethod | null>(null);
  const [roomModal, setRoomModal] = useState<RoomPlay | null>(null);
  const [playId, setPlayId] = useState(() => clonePlays(mine?.plays)[0]?.id ?? "");
  const [nickHistOpen, setNickHistOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const limitsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = packProfile(mine, session.nick);
    setProfile(next);
    setSavedProfile(next);
    const nextLogin = packLogin(mine);
    setLogin(nextLogin);
    setSavedLogin(nextLogin);
    const nextPlays = clonePlays(mine?.plays);
    setPlays(nextPlays);
    setSavedPlays(clonePlays(nextPlays));
    const nextPays = (mine?.pays ?? []).map((row) => ({ ...row }));
    setPays(nextPays);
    setSavedPays(nextPays.map((row) => ({ ...row })));
    setEditProfile(false);
    setEditLogin(false);
    setEditPayId("");
    setNewPay(null);
    setLimitsOpen(false);
    setPlayId((prev) => (nextPlays.some((row) => row.id === prev) ? prev : nextPlays[0]?.id ?? ""));
    setNickHistOpen(false);
  }, [mine?.id, session.nick]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!limitsRef.current?.contains(event.target as Node)) setLimitsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const ping = () => {
    if (waiting) onSent();
  };

  const writeMember = (patch: Partial<ClubMember>) => {
    if (!mine) return;
    const next: ClubMember = { ...mine, ...patch };
    const copy = list.map((row) => (row.id === mine.id ? next : row));
    setList(copy);
    saveMembers(copy);
  };

  const saveProfile = () => {
    const next = { ...profile, name: profile.name.trim(), city: profile.city.trim(), country: profile.country.trim(), phone: profile.phone.trim(), telegram: profile.telegram.trim() };
    writeMember(next);
    setProfile(next);
    setSavedProfile(next);
    setEditProfile(false);
    ping();
  };

  const saveLogin = () => {
    writeMember({ email: login.email.trim(), google: login.google.trim(), passwordSet: Boolean(login.password) || Boolean(mine?.passwordSet) });
    const next = { ...login, email: login.email.trim(), google: login.google.trim(), password: "" };
    setLogin(next);
    setSavedLogin(next);
    setEditLogin(false);
    ping();
  };

  const persistPlays = (next: RoomPlay[]) => {
    const cleaned = next.map((row) => ({
      ...row,
      nick: row.nick.trim(),
      limits: row.limits.length ? row.limits : ["50"],
      kinds: row.kinds.length ? row.kinds : (["nitro"] as ("nitro" | "regular")[]),
      nickHistory: row.nickHistory ?? [],
    }));
    writeMember({ plays: cleaned, room: cleaned[0]?.nick ?? "" });
    setPlays(clonePlays(cleaned));
    setSavedPlays(clonePlays(cleaned));
    ping();
  };

  const saveRoomSetup = (id: string) => {
    const draft = plays.find((row) => row.id === id);
    if (!draft) return;
    persistPlays(
      savedPlays.map((row) => (row.id === id ? { ...row, roomId: draft.roomId, limits: [...draft.limits], kinds: [...draft.kinds] } : row)),
    );
  };

  const saveRoomNick = (id: string) => {
    const draft = plays.find((row) => row.id === id);
    const saved = savedPlays.find((row) => row.id === id);
    if (!draft || !saved) return;
    const nick = draft.nick.trim();
    const history =
      nick && nick !== saved.nick ? [{ nick, at: new Date().toISOString() }, ...saved.nickHistory].slice(0, 20) : saved.nickHistory;
    persistPlays(
      savedPlays.map((row) => (row.id === id ? { ...row, nick, nickHistory: history } : row)),
    );
  };

  const savePayRow = (id: string) => {
    if (!pays.some((row) => row.id === id)) return;
    const next = pays.map((row) => ({ ...row, title: row.title.trim(), details: row.details.trim(), comment: row.comment.trim() }));
    if (next.length && !next.some((row) => row.primary)) next[0].primary = true;
    writeMember({ pays: next });
    setPays(next.map((row) => ({ ...row })));
    setSavedPays(next.map((row) => ({ ...row })));
    setEditPayId("");
    ping();
  };

  const saveNewPay = () => {
    if (!newPay) return;
    const row = { ...newPay, title: newPay.title.trim(), details: newPay.details.trim(), comment: newPay.comment.trim() };
    if (!row.title && !row.details) return;
    const next = [...savedPays.map((item) => ({ ...item, primary: row.primary ? false : item.primary })), row];
    if (!next.some((item) => item.primary)) next[0].primary = true;
    writeMember({ pays: next });
    setPays(next.map((item) => ({ ...item })));
    setSavedPays(next.map((item) => ({ ...item })));
    setNewPay(null);
    ping();
  };

  const saveSchedule = () => {
    const next = { ...prefs, month: "now" as const, pin: "" };
    savePrefs(next);
    setPrefs(next);
    setSavedPrefs({ ...next, limits: [...next.limits] });
    ping();
  };

  const setPrimaryPay = (id: string) => {
    const next = (editPayId ? pays : savedPays).map((row) => ({ ...row, primary: row.id === id }));
    if (editPayId) {
      setPays(next.map((row) => ({ ...row })));
      return;
    }
    writeMember({ pays: next });
    setPays(next.map((row) => ({ ...row })));
    setSavedPays(next.map((row) => ({ ...row })));
    ping();
  };

  const patchPlay = (id: string, part: Partial<RoomPlay>) => {
    setPlays((prev) => prev.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };

  const togglePlayLimit = (id: string, limit: string) => {
    const row = plays.find((item) => item.id === id);
    if (!row) return;
    const next = row.limits.includes(limit) ? row.limits.filter((item) => item !== limit) : [...row.limits, limit].sort((a, b) => Number(a) - Number(b));
    patchPlay(id, { limits: next.length ? next : row.limits });
  };

  const togglePlayKind = (id: string, kind: "nitro" | "regular") => {
    const row = plays.find((item) => item.id === id);
    if (!row) return;
    const next = row.kinds.includes(kind) ? row.kinds.filter((item) => item !== kind) : [...row.kinds, kind];
    patchPlay(id, { kinds: next.length ? next : row.kinds });
  };

  const setPay = (id: string, part: Partial<PayMethod>) => {
    setPays((prev) =>
      prev.map((row) => {
        if (row.id !== id) return part.primary ? { ...row, primary: false } : row;
        return { ...row, ...part };
      }),
    );
  };

  const openAddRoom = () => {
    const used = new Set(plays.map((row) => row.roomId));
    const roomId = ROOM_OPTIONS.find((room) => !used.has(room.id))?.id ?? "winamax";
    setRoomModal({ ...emptyRoomPlay(roomId), limits: [...prefs.limits], kinds: [prefs.kind] });
  };

  const saveModalRoom = () => {
    if (!roomModal) return;
    const nick = roomModal.nick.trim();
    const row: RoomPlay = {
      ...roomModal,
      nick,
      limits: roomModal.limits.length ? roomModal.limits : ["50"],
      kinds: roomModal.kinds.length ? roomModal.kinds : ["nitro"],
      nickHistory: nick ? [{ nick, at: new Date().toISOString() }] : [],
    };
    persistPlays([...savedPlays, row]);
    setPlayId(row.id);
    setRoomModal(null);
  };

  const markBg = mine ? memberBg(mine) : R.cyan;
  const markFg = mine ? memberFg(mine) : R.cyanInk;
  const letters = mine?.mark.t || session.nick.slice(0, 2).toUpperCase();
  const community = (mine?.community ?? (mine?.status === "pending" ? "school" : "club")) as CommunityKind;
  const roomNick = savedPlays[0]?.nick || mine?.room || "—";
  const prefsDirty = prefs.limits.join() !== savedPrefs.limits.join() || prefs.kind !== savedPrefs.kind;
  const profileDirty = !sameJson(profile, savedProfile);
  const loginDirty = !sameJson({ ...login, password: "" }, savedLogin) || Boolean(login.password);
  const roles = mine?.discordRoles?.length ? mine.discordRoles : [];
  const activePlay = plays.find((row) => row.id === playId) ?? plays[0];
  const savedPlay = activePlay ? savedPlays.find((item) => item.id === activePlay.id) : undefined;
  const setupDirty = Boolean(activePlay && savedPlay) && (activePlay.roomId !== savedPlay?.roomId || activePlay.limits.join() !== savedPlay?.limits.join() || activePlay.kinds.join() !== savedPlay?.kinds.join());
  const nickDirty = Boolean(activePlay && savedPlay) && activePlay.nick !== savedPlay?.nick;

  return (
    <div className="v2-cab">
      <section className="v2-block v2-cab-card is-discord">
        <div className="v2-cab-head">
          <h2>Discord</h2>
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-spread">
          <div className="v2-cab-idline">
            {mine?.avatar ? <img className="v2-cab-ava" src={mine.avatar} alt="" /> : <span className="v2-cab-ava" style={{ background: "#5865f2" }}>{(mine?.discordGuildNick || letters).slice(0, 2).toUpperCase()}</span>}
            <div className="v2-cab-idcopy">
              <b>{mine?.discordGuildNick || mine?.discord || "—"}</b>
              <span>{t("cabinet.assignedNick")}</span>
            </div>
          </div>
          <div className="v2-cab-facts">
            <Fact label={t("cabinet.discordServer")}>{org.guildName || t("cabinet.discordServerFallback")}</Fact>
            <Fact label="@">@{mine?.discord || "—"}</Fact>
            <Fact label="Discord ID">{mine?.discordId || "—"}</Fact>
          </div>
          <div className="v2-cab-facts is-end">
            <Fact label={t("cabinet.discordRoles")}>
              {roles.length ? (
                <span className="v2-cab-pills">
                  {roles.map((role) => (
                    <span key={role} className="v2-access-pill">
                      {role}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Fact>
          </div>
        </div>
        </div>
      </section>

      <section className="v2-block v2-cab-card is-club">
        <div className="v2-cab-head">
          <h2>{t("cabinet.rpTitle")}</h2>
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-spread">
          <div className="v2-cab-idline">
            <span className="v2-cab-mark" style={{ background: markBg, color: markFg }}>
              {letters || "—"}
            </span>
            <div className="v2-cab-idcopy">
              <b>{letters || "—"}</b>
              <span>{t("cabinet.markTitle")}</span>
            </div>
          </div>
          <div className="v2-cab-facts">
            <Fact label={t("cabinet.roomNick")}>{roomNick}</Fact>
            <Fact label={t("cabinet.joined")}>{mine?.joinedAt ? (/^\d{4}-\d{2}-\d{2}$/.test(mine.joinedAt) ? mine.joinedAt.split("-").reverse().join(".") : formatStamp(mine.joinedAt).slice(0, 10)) : "—"}</Fact>
            <Fact label={t("cabinet.poolShare")}>{`${mine?.poolShare ?? 80}%`}</Fact>
          </div>
          <div className="v2-cab-facts is-end">
            <Fact label="ID">{mine?.id || "—"}</Fact>
            <Fact label={t("cabinet.tables")}>{mine?.tables ?? 1}</Fact>
            <Fact label={t("cabinet.communityTitle")}>{t(`cabinet.community.${community}`)}</Fact>
            <Fact label={t("cabinet.vipLabel")}>{mine?.vip ? `VIP ${mine.vip}` : t("cabinet.vipNone")}</Fact>
          </div>
        </div>
        </div>
      </section>

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.who")}</h2>
          {mine ? (
            <EditSave editing={editProfile} dirty={profileDirty} titleEdit={t("cabinet.edit")} titleSave={t("cabinet.save")} onEdit={() => setEditProfile(true)} onSave={saveProfile} />
          ) : null}
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-grid">
          <Field label={t("cabinet.name")}>
            <input className="v2-ctrl w-full px-2" disabled={!editProfile} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          </Field>
          <Field label={t("cabinet.birthday")}>
            <input className="v2-ctrl w-full px-2" type="date" disabled={!editProfile} value={profile.birthday} onChange={(event) => setProfile({ ...profile, birthday: event.target.value })} />
          </Field>
          <Field label={t("cabinet.city")}>
            <input className="v2-ctrl w-full px-2" disabled={!editProfile} value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
          </Field>
          <Field label={t("cabinet.country")}>
            <input className="v2-ctrl w-full px-2" disabled={!editProfile} value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} />
          </Field>
          <Field label={t("cabinet.phone")}>
            <input className="v2-ctrl w-full px-2" disabled={!editProfile} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
          </Field>
          <Field label={t("cabinet.telegram")}>
            <input className="v2-ctrl w-full px-2" disabled={!editProfile} value={profile.telegram} onChange={(event) => setProfile({ ...profile, telegram: event.target.value })} />
          </Field>
        </div>
        <div className="v2-cab-inline">
          <label className="v2-cab-check">
            <input type="checkbox" disabled={!editProfile} checked={profile.showExtraTz} onChange={(event) => setProfile({ ...profile, showExtraTz: event.target.checked })} />
            {t("cabinet.extraTzOn")}
          </label>
          {profile.showExtraTz ? (
            <select className="v2-ctrl px-2" disabled={!editProfile} value={profile.extraUtc} onChange={(event) => setProfile({ ...profile, extraUtc: Number(event.target.value) })}>
              {UTC_OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  {utcLabel(offset)}
                  {offset === 3 ? ` · ${t("header.mskLabel")}` : ""}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        </div>
      </section>

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.loginTitle")}</h2>
          {mine ? (
            <EditSave editing={editLogin} dirty={loginDirty} titleEdit={t("cabinet.edit")} titleSave={t("cabinet.save")} onEdit={() => setEditLogin(true)} onSave={saveLogin} />
          ) : null}
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-grid">
          <Field label={t("cabinet.email")}>
            <input className="v2-ctrl w-full px-2" disabled={!editLogin} value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
          </Field>
          <Field label={t("cabinet.google")}>
            <input className="v2-ctrl w-full px-2" disabled={!editLogin} value={login.google} onChange={(event) => setLogin({ ...login, google: event.target.value })} />
          </Field>
          <Field label={t("cabinet.password")}>
            <input className="v2-ctrl w-full px-2" type="password" disabled={!editLogin} value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
          </Field>
        </div>
        </div>
      </section>

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.gameTitle")}</h2>
          <button type="button" className="v2-ctrl px-2" onClick={openAddRoom}>
            {t("cabinet.roomAdd")}
          </button>
        </div>
        <div className="v2-cab-body">
        {activePlay ? (
            <div className="v2-cab-room">
              <div className="v2-cab-room-pick">
                <Field label={t("cabinet.roomPick")}>
                  <select className="v2-ctrl px-2" value={activePlay.id} onChange={(event) => setPlayId(event.target.value)}>
                    {plays.map((row) => (
                      <option key={row.id} value={row.id}>
                        {roomName(row.roomId)}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="button" className={`v2-cab-ico${setupDirty ? " is-on" : ""}`} disabled={!setupDirty} title={t("cabinet.saveRoom")} onClick={() => saveRoomSetup(activePlay.id)}>
                  <Floppy />
                </button>
                {plays.length > 1 ? (
                  <button
                    type="button"
                    className="v2-cab-ghost"
                    onClick={() => {
                      const next = savedPlays.filter((item) => item.id !== activePlay.id);
                      persistPlays(next);
                      setPlayId(next[0]?.id ?? "");
                    }}
                  >
                    {t("cabinet.roomRemove")}
                  </button>
                ) : null}
              </div>
              <div className="v2-cab-room-main">
                <div className="v2-cab-room-col">
                  <p className="v2-cab-label">{t("cabinet.roomLimits")}</p>
                  <div className="v2-cab-pills">
                    {LIMIT_OPTIONS.map((limit) => (
                      <Chip key={limit} on={activePlay.limits.includes(limit)} onClick={() => togglePlayLimit(activePlay.id, limit)}>
                        NL {limit}
                      </Chip>
                    ))}
                  </div>
                  <p className="v2-cab-label">{t("cabinet.roomKinds")}</p>
                  <div className="v2-cab-pills">
                    {(["nitro", "regular"] as const).map((kind) => (
                      <Chip key={kind} on={activePlay.kinds.includes(kind)} onClick={() => togglePlayKind(activePlay.id, kind)}>
                        {kind === "nitro" ? "Nitro" : "Regular"}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="v2-cab-room-col">
                  <div className="v2-cab-nick-row">
                    <Field label={t("cabinet.roomNickField", { room: roomName(activePlay.roomId) })}>
                      <input className="v2-ctrl w-full px-2" value={activePlay.nick} onChange={(event) => patchPlay(activePlay.id, { nick: event.target.value })} />
                    </Field>
                    <button type="button" className={`v2-cab-ico${nickDirty ? " is-on" : ""}`} disabled={!nickDirty} title={t("cabinet.saveNick")} onClick={() => saveRoomNick(activePlay.id)}>
                      <Floppy />
                    </button>
                  </div>
                  {activePlay.nickHistory.length ? (
                    <ul className="v2-cab-history">
                      {activePlay.nickHistory.slice(0, 3).map((stamp, index) => (
                        <li key={`${stamp.nick}-${stamp.at}-${index}`}>
                          <b>{stamp.nick}</b>
                          <span>{formatStamp(stamp.at)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="v2-cab-hint">{t("cabinet.nickHistoryEmpty")}</p>
                  )}
                  {activePlay.nickHistory.length ? (
                    <button type="button" className="v2-cab-ghost" onClick={() => setNickHistOpen(true)}>
                      {t("cabinet.nickHistoryOpen")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
        ) : (
          <p className="v2-cab-hint">{t("cabinet.roomEmpty")}</p>
        )}
        </div>
      </section>

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.payTitle")}</h2>
          <button type="button" className="v2-ctrl px-2" onClick={() => setNewPay(emptyPay(!pays.length && !newPay))}>
            {t("cabinet.payAdd")}
          </button>
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-pay is-head">
          <span>{t("cabinet.payName")}</span>
          <span>{t("cabinet.payDetails")}</span>
          <span>{t("cabinet.payComment")}</span>
          <span className="v2-cab-pay-mainh">{t("cabinet.payMain")}</span>
          <span />
        </div>
        {pays.map((row) => {
          const saved = savedPays.find((item) => item.id === row.id);
          const editing = editPayId === row.id;
          const dirty = Boolean(saved) && !sameJson(row, saved);
          return (
            <div key={row.id} className="v2-cab-pay">
              <Field label={t("cabinet.payName")}>
                <input className="v2-ctrl w-full px-2" disabled={!editing} placeholder={t("cabinet.payNamePh")} value={row.title} onChange={(event) => setPay(row.id, { title: event.target.value })} />
              </Field>
              <Field label={t("cabinet.payDetails")}>
                <input className="v2-ctrl w-full px-2" disabled={!editing} placeholder={t("cabinet.payDetailsPh")} value={row.details} onChange={(event) => setPay(row.id, { details: event.target.value })} />
              </Field>
              <Field label={t("cabinet.payComment")}>
                <textarea className="v2-ctrl v2-cab-area" rows={3} disabled={!editing} placeholder={t("cabinet.payCommentPh")} value={row.comment} onChange={(event) => setPay(row.id, { comment: event.target.value })} />
              </Field>
              <div className="v2-cab-pay-tick">
                <Tick on={row.primary} label={t("cabinet.payMain")} onClick={() => setPrimaryPay(row.id)} />
              </div>
              <div className="v2-cab-pay-act">
                <EditSave
                  editing={editing}
                  dirty={dirty}
                  titleEdit={t("cabinet.edit")}
                  titleSave={t("cabinet.save")}
                  onEdit={() => {
                    setEditPayId(row.id);
                    setPays(savedPays.map((item) => ({ ...item })));
                  }}
                  onSave={() => savePayRow(row.id)}
                />
                {editing ? (
                  <button
                    type="button"
                    className="v2-cab-ghost"
                    onClick={() => {
                      const next = savedPays.filter((item) => item.id !== row.id);
                      writeMember({ pays: next });
                      setPays(next.map((item) => ({ ...item })));
                      setSavedPays(next.map((item) => ({ ...item })));
                      setEditPayId("");
                    }}
                  >
                    {t("cabinet.payRemove")}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {newPay ? (
          <div className="v2-cab-pay is-new">
            <Field label={t("cabinet.payName")}>
              <input className="v2-ctrl w-full px-2" placeholder={t("cabinet.payNamePh")} value={newPay.title} onChange={(event) => setNewPay({ ...newPay, title: event.target.value })} />
            </Field>
            <Field label={t("cabinet.payDetails")}>
              <input className="v2-ctrl w-full px-2" placeholder={t("cabinet.payDetailsPh")} value={newPay.details} onChange={(event) => setNewPay({ ...newPay, details: event.target.value })} />
            </Field>
            <Field label={t("cabinet.payComment")}>
              <textarea className="v2-ctrl v2-cab-area" rows={3} placeholder={t("cabinet.payCommentPh")} value={newPay.comment} onChange={(event) => setNewPay({ ...newPay, comment: event.target.value })} />
            </Field>
            <div className="v2-cab-pay-tick">
              <Tick on={newPay.primary} label={t("cabinet.payMain")} onClick={() => setNewPay({ ...newPay, primary: !newPay.primary })} />
            </div>
            <div className="v2-cab-pay-act">
              <button type="button" className="v2-cab-ico is-on" disabled={!newPay.title.trim() && !newPay.details.trim()} title={t("cabinet.paySaveNew")} onClick={saveNewPay}>
                <Floppy />
              </button>
              <button type="button" className="v2-cab-ghost" onClick={() => setNewPay(null)}>
                {t("cabinet.cancel")}
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </section>

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.filterTitle")}</h2>
          <button type="button" className={`v2-cab-ico${prefsDirty ? " is-on" : ""}`} disabled={!prefsDirty} title={t("cabinet.save")} onClick={saveSchedule}>
            <Floppy />
          </button>
        </div>
        <div className="v2-cab-body">
        <p className="v2-cab-hint">{t("cabinet.filterLead")}</p>
        <div className="v2-cab-filter">
          <div className="relative" ref={limitsRef}>
            <button type="button" className="v2-ctrl px-3" onClick={() => setLimitsOpen((open) => !open)}>
              {t("schedule.limit")}: <span className="v2-mono ml-1">{prefs.limits.join(" · ")}</span>
              <i className="fa-solid fa-angle-down ml-2" />
            </button>
            {limitsOpen ? (
              <div className="v2-cab-pop absolute z-40 mt-1 w-full overflow-hidden rounded border p-1">
                {LIMIT_OPTIONS.map((value) => {
                  const on = prefs.limits.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`v2-cab-pop-item${on ? " is-on" : ""}`}
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          limits: on && prefs.limits.length > 1 ? prefs.limits.filter((item) => item !== value) : on ? prefs.limits : [...prefs.limits, value].sort((a, b) => Number(a) - Number(b)),
                        })
                      }
                    >
                      <i className={`fa-solid ${on ? "fa-check-square" : "fa-square"}`} />
                      <span className="v2-mono">{value}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <label className="relative">
            <span className="v2-ctrl flex items-center px-3">
              {prefs.kind === "nitro" ? "Nitro" : "Regular"}
              <i className="fa-solid fa-angle-down ml-2" />
          </span>
            <select className="absolute inset-0 cursor-pointer opacity-0" value={prefs.kind} onChange={(event) => setPrefs({ ...prefs, kind: event.target.value === "regular" ? "regular" : "nitro" })}>
              <option value="nitro">Nitro</option>
              <option value="regular">Regular</option>
            </select>
          </label>
        </div>
        <p className="v2-cab-hint">{t("cabinet.filterNote")}</p>
        </div>
      </section>

      <button type="button" className="v2-cab-out" onClick={onLogout}>
        {t("login.logout")}
      </button>

      {roomModal ? (
        <div className="v2-mem-overlay" onClick={() => setRoomModal(null)}>
          <div className="v2-mem-modal v2-cab-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="v2-cab-head">
              <h2>{t("cabinet.roomAdd")}</h2>
            </div>
            <Field label={t("cabinet.roomPick")}>
              <select className="v2-ctrl w-full px-2" value={roomModal.roomId} onChange={(event) => setRoomModal({ ...roomModal, roomId: event.target.value })}>
                {ROOM_OPTIONS.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="v2-cab-label">{t("cabinet.roomLimits")}</p>
            <div className="v2-cab-pills">
              {LIMIT_OPTIONS.map((limit) => (
                <Chip key={limit} on={roomModal.limits.includes(limit)} onClick={() => setRoomModal({ ...roomModal, limits: roomModal.limits.includes(limit) ? roomModal.limits.filter((item) => item !== limit) : [...roomModal.limits, limit] })}>
                  NL {limit}
                </Chip>
              ))}
            </div>
            <p className="v2-cab-label">{t("cabinet.roomKinds")}</p>
            <div className="v2-cab-pills">
              {(["nitro", "regular"] as const).map((kind) => (
                <Chip key={kind} on={roomModal.kinds.includes(kind)} onClick={() => setRoomModal({ ...roomModal, kinds: roomModal.kinds.includes(kind) ? roomModal.kinds.filter((item) => item !== kind) : [...roomModal.kinds, kind] })}>
                  {kind === "nitro" ? "Nitro" : "Regular"}
                </Chip>
              ))}
            </div>
            <Field label={t("cabinet.roomNickField", { room: roomName(roomModal.roomId) })}>
              <input className="v2-ctrl w-full px-2" value={roomModal.nick} onChange={(event) => setRoomModal({ ...roomModal, nick: event.target.value })} />
            </Field>
            <div className="v2-cab-actions">
              <button type="button" className="v2-ctrl px-3 is-on" onClick={saveModalRoom}>
                {t("cabinet.saveRoom")}
              </button>
              <button type="button" className="v2-cab-ghost" onClick={() => setRoomModal(null)}>
                {t("cabinet.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {nickHistOpen && activePlay ? (
        <div className="v2-mem-overlay" onClick={() => setNickHistOpen(false)}>
          <div className="v2-mem-modal v2-cab-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="v2-cab-head">
              <h2>{t("cabinet.nickHistoryTitle", { room: roomName(activePlay.roomId) })}</h2>
            </div>
            <ul className="v2-cab-history">
              {activePlay.nickHistory.map((stamp, index) => (
                <li key={`${stamp.nick}-${stamp.at}-${index}`}>
                  <b>{stamp.nick}</b>
                  <span>{formatStamp(stamp.at)}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="v2-cab-ghost" onClick={() => setNickHistOpen(false)}>
              {t("cabinet.cancel")}
            </button>
          </div>
      </div>
      ) : null}
    </div>
  );
}
