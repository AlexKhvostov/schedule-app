import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { UTC_OFFSETS, utcLabel } from "../schedule/cet";
import { normalizePlay, type RoomPlay } from "../schedule/members";
import { emptyRoomPlay } from "../schedule/rooms";
import {
  discordPrimary,
  hasRoot,
  saveMemberClub,
  saveMemberDistanceId,
  saveMemberProfile,
  type AdminPerson,
  type ClubAccess,
} from "../data/people";
import type { NotifyChannel } from "../data/botSettings";
import { loadMyPlays, saveMyPlays } from "../data/plays";
import { CabinetLoginPanel, type LoginDraft } from "./CabinetLoginPanel";
import { CabinetPlaysPanel } from "./CabinetPlaysPanel";
import { Field, NotifyPicks } from "./cabinetUi";
import { PermanentPriority } from "./PermanentPriority";
import { ScheduleSlot } from "./ScheduleSlot";
import { PersonAvatar } from "./PersonAvatar";
import { loadTheme } from "./theme";
import { PayMethodsPanel } from "./PayMethodsPanel";
import { showV2Toast } from "./V2Toast";

type Props = {
  person: AdminPerson;
  people: AdminPerson[];
  selfMemberId?: string;
  busy: boolean;
  onClose: () => void;
  onAccess: (access: ClubAccess) => void;
  onCreateCard?: () => void;
  onMark: () => void;
  onReload: () => void;
  countTables?: boolean;
};

function isClubSeat(row: AdminPerson) {
  return row.accessStatus === "active" && Boolean(row.memberId);
}

function guarantorLabel(row: AdminPerson) {
  const name = discordPrimary(row);
  return row.username && name !== `@${row.username}` ? `${name} · @${row.username}` : name;
}

function guarantorOptions(people: AdminPerson[], selfId: string | null, currentId: string) {
  const seen = new Set<string>();
  const rows: AdminPerson[] = [];
  for (const row of people) {
    if (!row.memberId || row.memberId === selfId || seen.has(row.memberId)) continue;
    if (!isClubSeat(row) && row.memberId !== currentId) continue;
    seen.add(row.memberId);
    rows.push(row);
  }
  rows.sort((a, b) => discordPrimary(a).localeCompare(discordPrimary(b), "ru"));
  return rows;
}

function vipText(n: number | null | undefined) {
  return n && n > 0 ? String(n) : "";
}

function dash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function initials(row: AdminPerson) {
  return discordPrimary(row).replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

function stampLabel(value: string | null, locale: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(value: string | null, locale: string) {
  if (!value) return "—";
  const raw = value.slice(0, 10);
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clonePlays(list: RoomPlay[]) {
  return list.map((row) => normalizePlay(row));
}

function packPersonLogin(row: AdminPerson): LoginDraft {
  return {
    email: row.email ?? "",
    google: row.logins.google ? row.logins.googleHint || "on" : "",
    password: "",
  };
}

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  const empty = children === "—" || children === "" || children == null;
  return (
    <div className="v2-cab-fact">
      <span>{label}</span>
      <b className={`${empty ? "is-empty" : ""}${mono ? " v2-mono" : ""}`.trim() || undefined}>{children || "—"}</b>
    </div>
  );
}

function StaffOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="v2-staff-only">
      <b className="v2-staff-only-tag">{t("admin.people.staffOnly")}</b>
      {children}
    </div>
  );
}

function SaveBar({ dirty, busy, onSave, onCancel }: { dirty: boolean; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="v2-cab-foot">
      <span />
      <div className="v2-cab-foot-act">
        <button type="button" className="v2-cab-ghost" disabled={!dirty || busy} onClick={onCancel}>
          {t("admin.people.cancel")}
        </button>
        <button type="button" className={`v2-ctrl v2-save px-3${dirty ? " is-dirty" : ""}`} disabled={!dirty || busy} onClick={onSave}>
          {t("admin.save")}
        </button>
      </div>
    </div>
  );
}

export function AdminPersonCard({ person, people, selfMemberId, busy, onClose, onAccess, onCreateCard, onMark, onReload, countTables = false }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const canCloseSelf = person.memberId === selfMemberId;
  const canEdit = Boolean(person.memberId);

  const [name, setName] = useState(person.displayName ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [telegram, setTelegram] = useState(person.telegram ?? "");
  const [contactAlt, setContactAlt] = useState(person.contactAlt ?? "");
  const [city, setCity] = useState(person.city ?? "");
  const [country, setCountry] = useState(person.country ?? "");
  const [birthday, setBirthday] = useState(person.birthday?.slice(0, 10) ?? "");
  const [extraUtc, setExtraUtc] = useState(person.extraUtc ?? 3);
  const [channel, setChannel] = useState<NotifyChannel>(person.notifyChannel ?? "discord");
  const [savedChannel, setSavedChannel] = useState<NotifyChannel>(person.notifyChannel ?? "discord");

  const [tables, setTables] = useState(String(person.tables ?? 1));
  const [vipNitro, setVipNitro] = useState(vipText(person.vipNitro));
  const [vipRegular, setVipRegular] = useState(vipText(person.vipRegular));
  const [community, setCommunity] = useState<"school" | "club">(person.communityStatus === "school" ? "school" : "club");
  const [guarantorId, setGuarantorId] = useState(person.guarantorId ?? "");
  const [distanceId, setDistanceId] = useState(person.distanceExtId ?? "");

  const [plays, setPlays] = useState<RoomPlay[]>([]);
  const [savedPlays, setSavedPlays] = useState<RoomPlay[]>([]);
  const [playId, setPlayId] = useState("");
  const [playsReady, setPlaysReady] = useState(!person.memberId);
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState(() => packPersonLogin(person));
  const [savedLogin, setSavedLogin] = useState(() => packPersonLogin(person));

  useEffect(() => {
    setName(person.displayName ?? "");
    setPhone(person.phone ?? "");
    setTelegram(person.telegram ?? "");
    setContactAlt(person.contactAlt ?? "");
    setCity(person.city ?? "");
    setCountry(person.country ?? "");
    setBirthday(person.birthday?.slice(0, 10) ?? "");
    setExtraUtc(person.extraUtc ?? 3);
    setChannel(person.notifyChannel ?? "discord");
    setSavedChannel(person.notifyChannel ?? "discord");
    setTables(String(person.tables ?? 1));
    setVipNitro(vipText(person.vipNitro));
    setVipRegular(vipText(person.vipRegular));
    setCommunity(person.communityStatus === "school" ? "school" : "club");
    setGuarantorId(person.guarantorId ?? "");
    setDistanceId(person.distanceExtId ?? "");
    const nextLogin = packPersonLogin(person);
    setLogin(nextLogin);
    setSavedLogin(nextLogin);
  }, [person]);

  useEffect(() => {
    if (!person.memberId) {
      setPlays([]);
      setSavedPlays([]);
      setPlayId("");
      setPlaysReady(true);
      return;
    }
    let alive = true;
    setPlaysReady(false);
    void loadMyPlays(person.memberId).then((rows) => {
      if (!alive) return;
      const next = rows.length ? clonePlays(rows) : [normalizePlay(emptyRoomPlay("winamax"))];
      setPlays(clonePlays(next));
      setSavedPlays(clonePlays(rows));
      setPlayId(next[0]?.id ?? "");
      setPlaysReady(true);
    });
    return () => {
      alive = false;
    };
  }, [person.memberId]);

  const profileDraft = {
    name,
    phone,
    telegram,
    contactAlt,
    city,
    country,
    birthday,
    extraUtc,
  };
  const profileSaved = {
    name: person.displayName ?? "",
    phone: person.phone ?? "",
    telegram: person.telegram ?? "",
    contactAlt: person.contactAlt ?? "",
    city: person.city ?? "",
    country: person.country ?? "",
    birthday: person.birthday?.slice(0, 10) ?? "",
    extraUtc: person.extraUtc ?? 3,
  };
  const profileDirty = !sameJson(profileDraft, profileSaved);
  const clubDirty =
    Number(tables) !== (person.tables ?? 1) ||
    vipNitro !== vipText(person.vipNitro) ||
    vipRegular !== vipText(person.vipRegular) ||
    community !== (person.communityStatus === "school" ? "school" : "club") ||
    guarantorId !== (person.guarantorId ?? "") ||
    distanceId.trim() !== (person.distanceExtId ?? "").trim();
  const activePlay = plays.find((row) => row.id === playId) ?? plays[0];
  const roomNick = activePlay?.nick.trim() || "—";
  const guarantors = guarantorOptions(people, person.memberId, guarantorId);
  const patchPlay = (id: string, part: Partial<RoomPlay>) => {
    setPlays((prev) => prev.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };

  const fail = () => showV2Toast("err", t("admin.people.saveErr"));
  const ok = () => {
    showV2Toast("ok", t("admin.saved"));
    onReload();
  };

  const saveProfile = async () => {
    if (!person.memberId) return;
    setSaving(true);
    const result = await saveMemberProfile(person.memberId, {
      displayName: name,
      phone,
      telegram,
      contactAlt,
      city,
      country,
      birthday: birthday || null,
      extraUtc,
    });
    setSaving(false);
    if (result.error) fail();
    else ok();
  };

  const saveNotify = async () => {
    if (!person.memberId) return;
    setSaving(true);
    const result = await saveMemberProfile(person.memberId, { notifyChannel: channel });
    setSaving(false);
    if (result.error) fail();
    else {
      setSavedChannel(channel);
      ok();
    }
  };

  const saveLogin = async () => {
    if (!person.memberId) return;
    const email = login.email.trim();
    setSaving(true);
    const result = await saveMemberProfile(person.memberId, { email });
    setSaving(false);
    if (result.error) fail();
    else {
      const next = { ...login, email, password: "" };
      setLogin(next);
      setSavedLogin(next);
      ok();
    }
  };

  const bindGoogle = () => {
    showV2Toast("ok", t("cabinet.loginGoogleSoon"));
  };

  const unbindGoogle = () => {
    showV2Toast("ok", t("cabinet.loginGoogleSoon"));
  };

  const saveClub = async () => {
    if (!person.memberId) return;
    setSaving(true);
    const club = await saveMemberClub(person.memberId, {
      tables: Number(tables) || 1,
      vipNitro: Number(vipNitro) || 0,
      vipRegular: Number(vipRegular) || 0,
      communityStatus: community,
      guarantorId: guarantorId || null,
    });
    if (club.error) {
      setSaving(false);
      if (club.error === "vip-dup") showV2Toast("err", t("admin.people.vipDup"));
      else fail();
      return;
    }
    const distance = await saveMemberDistanceId(person.memberId, distanceId, person.discordId);
    setSaving(false);
    if (distance.error === "duplicate") showV2Toast("err", t("admin.people.distanceIdDup"));
    else if (distance.error === "bad-shape") showV2Toast("err", t("admin.people.distanceIdBad"));
    else if (distance.error) fail();
    else ok();
  };

  const persistPlays = async (next: RoomPlay[], selectRoomId?: string) => {
    if (!person.memberId) return false;
    const cleaned = next.map((row) => normalizePlay({ ...row, nick: row.nick.trim() }));
    const pickId = (stored: RoomPlay[], prev: string) => {
      if (selectRoomId) {
        const match = stored.find((row) => row.roomId === selectRoomId);
        if (match) return match.id;
      }
      if (stored.some((row) => row.id === prev)) return prev;
      const fromClean = cleaned.find((row) => row.id === prev);
      const byRoom = fromClean ? stored.find((row) => row.roomId === fromClean.roomId) : undefined;
      return byRoom?.id ?? stored[0]?.id ?? "";
    };
    setSaving(true);
    const result = await saveMyPlays(person.memberId, cleaned);
    setSaving(false);
    if (result.error) {
      fail();
      return false;
    }
    const stored = result.plays.length ? result.plays : cleaned;
    setPlays(clonePlays(stored));
    setSavedPlays(clonePlays(stored));
    setPlayId((prev) => pickId(stored, prev));
    ok();
    return true;
  };

  return createPortal(
    <div className={`v2-mem-overlay is-sheet is-wide theme-${loadTheme()}`} onClick={onClose}>
      <aside className="v2-mem-sheet is-club is-wide is-cablike" onClick={(event) => event.stopPropagation()}>
        <header className="v2-club-hero">
          <PersonAvatar src={person.avatarUrl} label={discordPrimary(person)} size="lg" />
          <div className="min-w-0 flex-1">
            <span className="v2-admin-kicker">{t("admin.people.cardKicker")}</span>
            <h3>{discordPrimary(person)}</h3>
            <p>@{person.username}</p>
          </div>
          {person.markTag ? (
            <span className="v2-mark-chip">
              <ScheduleSlot letters={person.markTag} bg={person.markBg} fg={person.markFg} showTables={countTables} />
            </span>
          ) : null}
          <button type="button" className="v2-ctrl px-3" onClick={onClose}>
            {t("admin.people.close")}
          </button>
        </header>
        <p className="v2-cablike-lead">{t("admin.people.cardLead")}</p>

        <div className="v2-cab">
            <section className="v2-block v2-cab-card v2-staff-card">
              <div className="v2-cab-head">
                <h2>{t("admin.people.colAccess")}</h2>
                <span className="v2-staff-only-tag">{t("admin.people.staffOnly")}</span>
              </div>
              <div className="v2-cab-body">
                {person.memberId ? (
                  <AccessSeg
                    value={person.accessStatus === "active" ? "member" : "closed"}
                    lockedClosed={hasRoot(person) || canCloseSelf}
                    busy={busy}
                    onChange={onAccess}
                  />
                ) : (
                  <button type="button" className="v2-ctrl" disabled={busy} onClick={onCreateCard}>
                    {t("admin.people.createCard")}
                  </button>
                )}
                {person.memberId && !person.onGuild ? <p className="v2-cab-hint">{t("admin.people.leftGuildHint")}</p> : null}
                {hasRoot(person) ? (
                  <p className="v2-cab-hint">
                    <i className="v2-club-root">{t("admin.root.roleRoot")}</i>
                    {t("admin.people.rootHint")}
                  </p>
                ) : null}
                {canCloseSelf && !hasRoot(person) ? <p className="v2-cab-hint">{t("admin.people.selfLocked")}</p> : null}
              </div>
            </section>

            <section className="v2-block v2-cab-card is-discord">
              <div className="v2-cab-head">
                <h2>Discord</h2>
              </div>
              <div className="v2-cab-body">
                <div className="v2-cab-spread">
                  <div className="v2-cab-idline">
                    {person.avatarUrl ? (
                      <img className="v2-cab-ava" src={person.avatarUrl} alt="" />
                    ) : (
                      <span className="v2-cab-ava" style={{ background: "#5865f2" }}>
                        {initials(person)}
                      </span>
                    )}
                    <div className="v2-cab-idcopy">
                      <b>{dash(person.nick || person.globalName)}</b>
                      <span>{t("cabinet.assignedNick")}</span>
                    </div>
                  </div>
                  <div className="v2-cab-facts">
                    <Fact label={t("cabinet.guildNick")}>{dash(person.nick)}</Fact>
                    <Fact label={t("cabinet.discordName")}>{dash(person.globalName)}</Fact>
                    <Fact label={t("cabinet.discordUser")}>{person.username ? `@${person.username}` : "—"}</Fact>
                    <Fact label={t("cabinet.discordJoined")}>{dayLabel(person.joinedAt, lang)}</Fact>
                  </div>
                  <div className="v2-cab-facts is-end">
                    <Fact label={t("cabinet.discordRoles")}>
                      {person.discordRoles.length ? (
                        <span className="v2-cab-pills">
                          {person.discordRoles.map((role) => (
                            <span
                              key={role.id}
                              className="v2-access-pill"
                              style={role.color ? { color: role.color, background: `color-mix(in srgb, ${role.color} 16%, transparent)` } : undefined}
                            >
                              {role.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Fact>
                  </div>
                </div>
                <StaffOnly>
                  <div className="v2-cab-facts">
                    <Fact label={t("cabinet.discordId")} mono>
                      {dash(person.discordId)}
                    </Fact>
                    <Fact label={t("admin.people.bot")}>{person.bot ? t("admin.people.yes") : t("admin.people.no")}</Fact>
                  </div>
                </StaffOnly>
              </div>
            </section>

            <section className="v2-block v2-cab-card is-club">
              <div className="v2-cab-head">
                <h2>{t("cabinet.rpTitle")}</h2>
              </div>
              <div className="v2-cab-body">
                <div className="v2-cab-spread">
                  <div className="v2-cab-idline is-mark">
                    <span className="v2-mark-chip">
                      <ScheduleSlot letters={person.markTag} bg={person.markBg} fg={person.markFg} showTables={countTables} />
                    </span>
                    <div className="v2-cab-idcopy">
                      <b>{person.markTag || t("cabinet.markNone")}</b>
                      <span>{t("cabinet.markTitle")}</span>
                    </div>
                  </div>
                  <div className="v2-cab-facts">
                    <Fact label={t("cabinet.roomNick")}>{roomNick}</Fact>
                    <Fact label={t("cabinet.joined")}>{dayLabel(person.createdAt, lang)}</Fact>
                    <Fact label={t("cabinet.communityTitle")}>
                      {person.communityStatus === "school" || person.communityStatus === "club"
                        ? t(`cabinet.community.${person.communityStatus}`)
                        : "—"}
                    </Fact>
                  </div>
                  <PermanentPriority nitro={person.vipNitro} regular={person.vipRegular} />
                </div>
                {canEdit ? (
                  <StaffOnly>
                    <div className="v2-club-mark-row mt-0">
                      <span className="v2-mark-chip">
                        <ScheduleSlot letters={person.markTag} bg={person.markBg} fg={person.markFg} showTables={countTables} />
                      </span>
                      <button type="button" className="v2-ctrl px-3" onClick={onMark}>
                        {t("admin.people.markEdit")}
                      </button>
                    </div>
                    <div className="v2-club-form">
                      {countTables ? (
                        <Field label={t("cabinet.tables")} hint={t("admin.people.tablesHint")}>
                          <input className="v2-ctrl w-full px-3" inputMode="numeric" value={tables} onChange={(event) => setTables(event.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
                        </Field>
                      ) : null}
                      <Field label={t("cabinet.communityTitle")} hint={t("cabinet.communityHint")}>
                        <select className="v2-ctrl w-full px-2" value={community} onChange={(event) => setCommunity(event.target.value as "school" | "club")}>
                          <option value="club">{t("cabinet.community.club")}</option>
                          <option value="school">{t("cabinet.community.school")}</option>
                        </select>
                      </Field>
                      <Field label={t("admin.people.guarantor")} hint={t("admin.people.guarantorHint")}>
                        <select className="v2-ctrl w-full px-2" value={guarantorId} onChange={(event) => setGuarantorId(event.target.value)}>
                          <option value="">{t("admin.people.guarantorNone")}</option>
                          {guarantors.map((row) => (
                            <option key={row.memberId} value={row.memberId ?? ""}>
                              {guarantorLabel(row)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("admin.people.distanceIdLong")} hint={t("admin.people.distanceIdHint")}>
                        <input
                          className="v2-ctrl v2-mono w-full px-3"
                          inputMode="numeric"
                          placeholder={t("admin.people.distanceIdPh")}
                          value={distanceId}
                          onChange={(event) => setDistanceId(event.target.value.replace(/[^\d]/g, "").slice(0, 12))}
                        />
                      </Field>
                    </div>
                    <div className="v2-prio-edit">
                      <span>{t("cabinet.vipLabel")}</span>
                      <p className="v2-cab-hint">{t("admin.people.vipHint")}</p>
                      <div className="v2-prio-edit-grid">
                        <Field label="Nitro">
                          <input
                            className="v2-ctrl w-full px-3"
                            inputMode="numeric"
                            placeholder="—"
                            value={vipNitro}
                            onChange={(event) => setVipNitro(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                          />
                        </Field>
                        <Field label="Regular">
                          <input
                            className="v2-ctrl w-full px-3"
                            inputMode="numeric"
                            placeholder="—"
                            value={vipRegular}
                            onChange={(event) => setVipRegular(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="v2-cab-facts">
                      <Fact label={t("admin.people.loggedIn")}>{person.loggedIn ? t("admin.people.yes") : t("admin.people.no")}</Fact>
                      <Fact label={t("admin.people.colAccess")}>
                        {person.accessStatus === "active" ? t("admin.people.profileActive") : t("admin.people.profileBlocked")}
                      </Fact>
                      <Fact label={t("cabinet.clubCode")} mono>
                        {dash(person.publicCode)}
                      </Fact>
                      <Fact label={t("admin.people.memberKey")} mono>
                        {dash(person.memberId)}
                      </Fact>
                      <Fact label={t("admin.people.created")}>{stampLabel(person.createdAt, lang)}</Fact>
                      <Fact label={t("admin.people.approved")}>{stampLabel(person.approvedAt, lang)}</Fact>
                    </div>
                    <SaveBar
                      dirty={clubDirty}
                      busy={saving}
                      onSave={() => void saveClub()}
                      onCancel={() => {
                        setTables(String(person.tables ?? 1));
                        setVipNitro(vipText(person.vipNitro));
                        setVipRegular(vipText(person.vipRegular));
                        setCommunity(person.communityStatus === "school" ? "school" : "club");
                        setGuarantorId(person.guarantorId ?? "");
                        setDistanceId(person.distanceExtId ?? "");
                      }}
                    />
                  </StaffOnly>
                ) : (
                  <p className="v2-cab-hint">{t("admin.people.noCard")}</p>
                )}
              </div>
            </section>

            {!canEdit ? null : (
              <>
                <section className="v2-block v2-cab-card">
                  <div className="v2-cab-head">
                    <h2>{t("cabinet.who")}</h2>
                  </div>
                  <div className="v2-cab-body">
                    <p className="v2-cab-note">
                      <i className="fa-solid fa-lock" aria-hidden />
                      <span>{t("cabinet.whoPrivacy")}</span>
                    </p>
                    <div className="v2-cab-grid">
                    <Field label={t("admin.people.name")}>
                      <input className="v2-ctrl w-full px-3" value={name} onChange={(event) => setName(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.phone")}>
                      <input className="v2-ctrl w-full px-3" value={phone} onChange={(event) => setPhone(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.telegram")}>
                      <input className="v2-ctrl w-full px-3" placeholder="@username" value={telegram} onChange={(event) => setTelegram(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.contactAlt")}>
                      <input className="v2-ctrl w-full px-3" value={contactAlt} onChange={(event) => setContactAlt(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.city")}>
                      <input className="v2-ctrl w-full px-3" value={city} onChange={(event) => setCity(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.country")}>
                      <input className="v2-ctrl w-full px-3" value={country} onChange={(event) => setCountry(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.birthday")}>
                      <input className="v2-ctrl w-full px-3" type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
                    </Field>
                    <Field label={t("cabinet.extraUtc")}>
                      <select className="v2-ctrl w-full px-2" value={extraUtc} onChange={(event) => setExtraUtc(Number(event.target.value))}>
                        {UTC_OFFSETS.map((offset) => (
                          <option key={offset} value={offset}>
                            {utcLabel(offset)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    </div>
                    <SaveBar dirty={profileDirty} busy={saving} onSave={() => void saveProfile()} onCancel={() => {
                      setName(profileSaved.name);
                      setPhone(profileSaved.phone);
                      setTelegram(profileSaved.telegram);
                      setContactAlt(profileSaved.contactAlt);
                      setCity(profileSaved.city);
                      setCountry(profileSaved.country);
                      setBirthday(profileSaved.birthday);
                      setExtraUtc(profileSaved.extraUtc);
                    }} />
                  </div>
                </section>

                <section className="v2-block v2-cab-card is-notify">
                  <div className="v2-cab-head">
                    <h2>{t("cabinet.notifyTitle")}</h2>
                  </div>
                  <div className="v2-cab-body">
                    <p className="v2-cab-hint">{t("cabinet.notifyAdminLead")}</p>
                    <NotifyPicks value={channel} disabled={!canEdit || saving} onChange={setChannel} />
                    <p className="v2-cab-note">
                      <i className="fa-solid fa-bell" aria-hidden />
                      <span>
                        {channel === "telegram" && !telegram
                          ? t("cabinet.notifyNeedTelegram")
                          : channel === "email" && !login.email
                            ? t("cabinet.notifyNeedEmail")
                            : t(`cabinet.notify.${channel}Note`)}
                      </span>
                    </p>
                    <SaveBar
                      dirty={channel !== savedChannel}
                      busy={saving}
                      onSave={() => void saveNotify()}
                      onCancel={() => setChannel(savedChannel)}
                    />
                  </div>
                </section>

                <CabinetLoginPanel
                  lead={t("admin.people.loginLead")}
                  discordLead={t("admin.people.loginDiscordLead")}
                  discordOn={person.logins.discord || person.loggedIn}
                  discordHint={person.username ? `@${person.username}` : person.nick}
                  login={login}
                  saved={savedLogin}
                  passwordSet={person.logins.email}
                  canEdit={canEdit}
                  onChange={setLogin}
                  onSave={() => void saveLogin()}
                  onCancel={() => setLogin({ ...savedLogin, password: "" })}
                  onBindGoogle={bindGoogle}
                  onUnbindGoogle={unbindGoogle}
                />

                <CabinetPlaysPanel
                  plays={plays}
                  savedPlays={savedPlays}
                  playId={playId}
                  loading={!playsReady}
                  canEdit={canEdit}
                  defaultNick={person.username || person.nick || discordPrimary(person)}
                  onPlayId={setPlayId}
                  onPatch={patchPlay}
                  onPersist={persistPlays}
                  onCancel={() => {
                    const next = savedPlays.length ? clonePlays(savedPlays) : [normalizePlay(emptyRoomPlay("winamax"))];
                    setPlays(next);
                    setPlayId(next[0]?.id ?? "");
                  }}
                />

                <PayMethodsPanel memberId={person.memberId} canEdit={canEdit} live />
              </>
            )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function AccessSeg({
  value,
  lockedClosed,
  busy,
  onChange,
}: {
  value: ClubAccess;
  lockedClosed?: boolean;
  busy?: boolean;
  onChange: (next: ClubAccess) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="v2-club-seg">
      {(["closed", "member"] as const).map((key) => (
        <button
          key={key}
          type="button"
          className={value === key ? `is-on is-${key}` : undefined}
          disabled={busy || (key === "closed" && lockedClosed)}
          onClick={() => onChange(key)}
        >
          {t(`admin.people.access.${key}`)}
        </button>
      ))}
    </div>
  );
}
