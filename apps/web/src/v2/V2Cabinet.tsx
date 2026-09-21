import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS } from "../schedule/capacity";
import { UTC_OFFSETS, utcLabel, savePlayerUtc } from "../schedule/cet";
import {
  loadMembers,
  loadStoredPlays,
  loadStoredWinamaxLimits,
  memberBg,
  memberFg,
  memberOfSession,
  saveMembers,
  saveStoredPlays,
  normalizePlay,
  type ClubMember,
  type CommunityKind,
  type RoomPlay,
} from "../schedule/members";
import { emptyRoomPlay } from "../schedule/rooms";
import { isLiveData } from "../data/config";
import { loadCachedGuild, loadMyDiscord, personLabel, type GuildPerson } from "../data/guild";
import { loadMyCabinet, saveMemberProfile, type MyCabinet } from "../data/people";
import type { NotifyChannel } from "../data/botSettings";
import { loadMyPlays, saveMyPlays } from "../data/plays";
import { CabinetLoginPanel, type LoginDraft } from "./CabinetLoginPanel";
import { CabinetPlaysPanel } from "./CabinetPlaysPanel";
import { BlockBar, Field, NotifyPicks } from "./cabinetUi";
import { loadDiscordOrg } from "./discordOrg";
import { PayMethodsPanel } from "./PayMethodsPanel";
import { PermanentPriority } from "./PermanentPriority";
import { loadPrefs, savePrefs } from "./prefs";
import { ScheduleSlot } from "./ScheduleSlot";
import type { Session } from "./session";
import { showV2Toast } from "./V2Toast";
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
  contactAlt: string;
  extraUtc: number;
};

function packProfile(row: ClubMember | undefined, nick: string): ProfileDraft {
  return {
    name: row?.name || nick,
    birthday: row?.birthday ?? "",
    city: row?.city ?? "",
    country: row?.country ?? "",
    phone: row?.phone ?? "",
    telegram: row?.telegram ?? "",
    contactAlt: row?.contactAlt ?? "",
    extraUtc: row?.extraUtc ?? 3,
  };
}

function packLiveProfile(card: MyCabinet | null, nick: string): ProfileDraft {
  return {
    name: card?.displayName || nick,
    birthday: card?.birthday?.slice(0, 10) ?? "",
    city: card?.city ?? "",
    country: card?.country ?? "",
    phone: card?.phone ?? "",
    telegram: card?.telegram ?? "",
    contactAlt: card?.contactAlt ?? "",
    extraUtc: card?.extraUtc ?? 3,
  };
}

function dash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function packLogin(row: ClubMember | undefined): LoginDraft {
  return { email: row?.email ?? "", google: row?.google ?? "", password: "" };
}

function clonePlays(list: RoomPlay[] | undefined): RoomPlay[] {
  return (list ?? []).map((row) => normalizePlay(row));
}

function playsForSession(mine: ClubMember | undefined, session: Session): RoomPlay[] {
  const existing = clonePlays(mine?.plays);
  if (existing.length) return existing;
  const storedPlays = loadStoredPlays(session.memberId);
  if (storedPlays.length) return storedPlays;
  const stored = loadStoredWinamaxLimits(session.memberId);
  return [
    normalizePlay({
      ...emptyRoomPlay("winamax"),
      nick: session.nick,
      nitroLimits: stored,
      regularLimits: [],
      limits: stored,
      kinds: stored.length ? ["nitro"] : [],
      nickHistory: [],
    }),
  ];
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function dayLabel(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const raw = value.slice(0, 10);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TipLabel({ text, hint }: { text: string; hint?: string }) {
  if (!hint) return <span>{text}</span>;
  return (
    <span className="v2-cab-tip-src" tabIndex={0}>
      {text}
      <em className="v2-cab-tip" role="tooltip">
        {hint}
      </em>
    </span>
  );
}

function Fact({
  label,
  hint,
  mono,
  children,
}: {
  label: string;
  hint?: string;
  mono?: boolean;
  children: ReactNode;
}) {
  const empty = children === "—" || children === "" || children == null;
  return (
    <div className={`v2-cab-fact${hint ? " has-tip" : ""}`}>
      <span className={hint ? "v2-cab-tip-src" : undefined} tabIndex={hint ? 0 : undefined}>
        {label}
      </span>
      <b className={`${empty ? "is-empty" : ""}${mono ? " v2-mono" : ""}`.trim() || undefined}>{children || "—"}</b>
      {hint ? (
        <em className="v2-cab-tip" role="tooltip">
          {hint}
        </em>
      ) : null}
    </div>
  );
}

export function V2Cabinet({ session, onSent, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const org = loadDiscordOrg();
  const live = isLiveData();
  const [list, setList] = useState(() => loadMembers());
  const mine = useMemo(() => memberOfSession(list, session), [list, session]);
  const waiting = session.access !== "active";
  const [discord, setDiscord] = useState<GuildPerson | null>(null);
  const [guildName, setGuildName] = useState(org.guildName);
  const [card, setCard] = useState<MyCabinet | null>(null);
  const [cardReady, setCardReady] = useState(!live);

  const [profile, setProfile] = useState(() =>
    live
      ? { name: "", birthday: "", city: "", country: "", phone: "", telegram: "", contactAlt: "", extraUtc: 3 }
      : packProfile(mine, session.nick),
  );
  const [savedProfile, setSavedProfile] = useState(() =>
    live
      ? { name: "", birthday: "", city: "", country: "", phone: "", telegram: "", contactAlt: "", extraUtc: 3 }
      : packProfile(mine, session.nick),
  );
  const [login, setLogin] = useState(() => (live ? { email: "", google: "", password: "" } : packLogin(mine)));
  const [savedLogin, setSavedLogin] = useState(() => (live ? { email: "", google: "", password: "" } : packLogin(mine)));
  const [plays, setPlays] = useState(() => playsForSession(mine, session));
  const [savedPlays, setSavedPlays] = useState(() => clonePlays(plays));
  const [prefs, setPrefs] = useState(loadPrefs);
  const [savedPrefs, setSavedPrefs] = useState(loadPrefs);
  const [playId, setPlayId] = useState(() => plays[0]?.id ?? "");
  const [limitsOpen, setLimitsOpen] = useState(false);
  const limitsRef = useRef<HTMLDivElement>(null);
  const [channel, setChannel] = useState<NotifyChannel>("discord");
  const [savedChannel, setSavedChannel] = useState<NotifyChannel>("discord");

  useEffect(() => {
    if (!live || !session.memberId) return;
    void Promise.all([
      loadMyDiscord(session.memberId),
      loadCachedGuild(),
      loadMyCabinet(session.memberId),
      loadMyPlays(session.memberId),
    ]).then(([person, guild, nextCard, nextPlays]) => {
      setDiscord(person);
      if (guild?.name) setGuildName(guild.name);
      setCard(nextCard);
      setCardReady(true);
      if (nextPlays.length) {
        setPlays(clonePlays(nextPlays));
        setSavedPlays(clonePlays(nextPlays));
        setPlayId((prev) => (nextPlays.some((row) => row.id === prev) ? prev : nextPlays[0]?.id ?? ""));
        saveStoredPlays(session.memberId, nextPlays);
      }
    });
  }, [live, session.memberId]);

  useEffect(() => {
    if (live) return;
    const next = packProfile(mine, session.nick);
    setProfile(next);
    setSavedProfile(next);
    savePlayerUtc(next.extraUtc);
    const nextLogin = packLogin(mine);
    setLogin(nextLogin);
    setSavedLogin(nextLogin);
    const nextPlays = playsForSession(mine, session);
    setPlays(nextPlays);
    setSavedPlays(clonePlays(nextPlays));
    setLimitsOpen(false);
    setPlayId((prev) => (nextPlays.some((row) => row.id === prev) ? prev : nextPlays[0]?.id ?? ""));
  }, [live, mine?.id, session.nick]);

  useEffect(() => {
    if (!live || !cardReady) return;
    const next = packLiveProfile(card, session.nick);
    setProfile(next);
    setSavedProfile(next);
    if (card) savePlayerUtc(next.extraUtc);
    const nextLogin = { email: card?.email ?? "", google: mine?.google ?? "", password: "" };
    setLogin(nextLogin);
    setSavedLogin(nextLogin);
    const nextChannel = card?.notifyChannel ?? "discord";
    setChannel(nextChannel);
    setSavedChannel(nextChannel);
  }, [live, cardReady, card, session.nick]);

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

  const saveProfile = async () => {
    const next = { ...profile, name: profile.name.trim(), city: profile.city.trim(), country: profile.country.trim(), phone: profile.phone.trim(), telegram: profile.telegram.trim(), contactAlt: profile.contactAlt.trim() };
    if (live && session.memberId) {
      const result = await saveMemberProfile(session.memberId, {
        displayName: next.name,
        phone: next.phone,
        city: next.city,
        country: next.country,
        birthday: next.birthday,
        extraUtc: next.extraUtc,
        telegram: next.telegram,
        contactAlt: next.contactAlt,
      });
      if (result.error) {
        showV2Toast("err", t("cabinet.saveErr"));
        return;
      }
      setCard((prev) =>
        prev
          ? {
              ...prev,
              displayName: next.name || null,
              phone: next.phone || null,
              city: next.city || null,
              country: next.country || null,
              birthday: next.birthday || null,
              extraUtc: next.extraUtc,
              telegram: next.telegram || null,
              contactAlt: next.contactAlt || null,
            }
          : prev,
      );
      showV2Toast("ok", t("cabinet.saved"));
    } else {
      writeMember(next);
      showV2Toast("ok", t("cabinet.saved"));
    }
    setProfile(next);
    setSavedProfile(next);
    savePlayerUtc(next.extraUtc);
    ping();
  };

  const saveNotify = async () => {
    if (live && session.memberId) {
      const result = await saveMemberProfile(session.memberId, { notifyChannel: channel });
      if (result.error) {
        showV2Toast("err", t("cabinet.saveErr"));
        return;
      }
      setCard((prev) => (prev ? { ...prev, notifyChannel: channel } : prev));
    }
    setSavedChannel(channel);
    showV2Toast("ok", t("cabinet.saved"));
    ping();
  };

  const saveLogin = async () => {
    const email = login.email.trim();
    const google = login.google.trim();
    if (live && session.memberId) {
      const result = await saveMemberProfile(session.memberId, { email });
      if (result.error) {
        showV2Toast("err", t("cabinet.saveErr"));
        return;
      }
      setCard((prev) => (prev ? { ...prev, email: email || null } : prev));
      showV2Toast("ok", t("cabinet.saved"));
    } else {
      writeMember({ email, google, passwordSet: Boolean(login.password) || Boolean(mine?.passwordSet) });
      showV2Toast("ok", t("cabinet.saved"));
    }
    const next = { ...login, email, google, password: "" };
    setLogin(next);
    setSavedLogin(next);
    ping();
  };

  const bindGoogle = () => {
    if (live) {
      showV2Toast("ok", t("cabinet.loginGoogleSoon"));
      return;
    }
    const next = { ...login, google: login.google.trim() || "on" };
    writeMember({ google: next.google });
    setLogin(next);
    setSavedLogin({ ...next, password: "" });
    showV2Toast("ok", t("cabinet.saved"));
    ping();
  };

  const unbindGoogle = () => {
    if (live) {
      showV2Toast("ok", t("cabinet.loginGoogleSoon"));
      return;
    }
    const next = { ...login, google: "" };
    writeMember({ google: "" });
    setLogin(next);
    setSavedLogin({ ...next, password: "" });
    ping();
  };

  const persistPlays = async (next: RoomPlay[], selectRoomId?: string) => {
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
    if (live && session.memberId) {
      const result = await saveMyPlays(session.memberId, cleaned);
      if (result.error) {
        showV2Toast("err", t("cabinet.saveErr"));
        return false;
      }
      const stored = result.plays.length ? result.plays : cleaned;
      saveStoredPlays(session.memberId, stored);
      setPlays(clonePlays(stored));
      setSavedPlays(clonePlays(stored));
      setPlayId((prev) => pickId(stored, prev));
      showV2Toast("ok", t("cabinet.saved"));
      ping();
      return true;
    }
    writeMember({ plays: cleaned, room: cleaned[0]?.nick ?? "" });
    saveStoredPlays(session.memberId, cleaned);
    setPlays(clonePlays(cleaned));
    setSavedPlays(clonePlays(cleaned));
    setPlayId((prev) => pickId(cleaned, prev));
    showV2Toast("ok", t("cabinet.saved"));
    ping();
    return true;
  };

  const saveSchedule = () => {
    const next = { ...prefs, month: "now" as const, pin: "" };
    savePrefs(next);
    setPrefs(next);
    setSavedPrefs({ ...next, limits: [...next.limits] });
    showV2Toast("ok", t("cabinet.saved"));
    ping();
  };

  const patchPlay = (id: string, part: Partial<RoomPlay>) => {
    setPlays((prev) => prev.map((row) => (row.id === id ? { ...row, ...part } : row)));
  };

  const markBg = mine ? memberBg(mine) : session.markBg || R.cyan;
  const markFg = mine ? memberFg(mine) : session.markFg || R.cyanInk;
  const letters = (mine?.mark.t || session.markTag || "").trim();
  const community = (
    live
      ? card?.communityStatus === "school" || card?.communityStatus === "club"
        ? card.communityStatus
        : null
      : ((mine?.community ?? (mine?.status === "pending" ? "school" : "club")) as CommunityKind)
  );
  const roomNick = savedPlays[0]?.nick || mine?.room || "—";
  const vipNitro = live ? card?.vipNitro : mine?.vipNitro;
  const vipRegular = live ? card?.vipRegular : mine?.vipRegular;
  const prefsDirty = prefs.limits.join() !== savedPrefs.limits.join() || prefs.kind !== savedPrefs.kind;
  const profileDirty = !sameJson(profile, savedProfile);
  const roles = discord?.roles.length
    ? discord.roles
    : (mine?.discordRoles ?? []).map((name) => ({ id: name, name, color: null as string | null }));
  const guildNick = discord?.nick || mine?.discordGuildNick || "";
  const discordName = discord?.globalName || mine?.discordDisplay || "";
  const discordUser = discord?.username || mine?.discord || "";
  const discordNick = discord ? personLabel(discord) : guildNick || discordName || discordUser || session.nick;
  const discordAva = discord?.avatarUrl || mine?.avatar;
  const discordJoined = discord?.joinedAt || mine?.joinedAt || null;
  const discordLetters = discordNick.replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 2).toUpperCase() || letters;
  const clubJoined = live ? card?.createdAt : mine?.joinedAt;
  const canEditCard = Boolean(mine || (live && session.memberId && cardReady));

  return (
    <div className="v2-cab">
      <section className="v2-block v2-cab-card is-discord">
        <div className="v2-cab-head">
          <h2>Discord</h2>
        </div>
        <div className="v2-cab-body">
        <div className="v2-cab-spread">
          <div className="v2-cab-idline">
            {discordAva ? (
              <img className="v2-cab-ava" src={discordAva} alt="" />
            ) : (
              <span className="v2-cab-ava" style={{ background: "#5865f2" }}>
                {discordLetters}
              </span>
            )}
            <div className="v2-cab-idcopy">
              <b>{discordNick || "—"}</b>
              <TipLabel text={t("cabinet.assignedNick")} hint={t("cabinet.assignedNickHint")} />
            </div>
          </div>
          <div className="v2-cab-facts">
            <Fact label={t("cabinet.guildNick")} hint={t("cabinet.guildNickHint")}>
              {dash(guildNick)}
            </Fact>
            <Fact label={t("cabinet.discordName")} hint={t("cabinet.discordNameHint")}>
              {dash(discordName)}
            </Fact>
            <Fact label={t("cabinet.discordUser")} hint={t("cabinet.discordUserHint")}>
              {discordUser ? `@${discordUser}` : "—"}
            </Fact>
          </div>
          <div className="v2-cab-facts is-end">
            <Fact label={t("cabinet.discordServer")} hint={t("cabinet.discordServerHint")}>
              {guildName || t("cabinet.discordServerFallback")}
            </Fact>
            <Fact label={t("cabinet.discordJoined")} hint={t("cabinet.discordJoinedHint")}>
              {dayLabel(discordJoined, lang)}
            </Fact>
            <Fact label={t("cabinet.discordRoles")} hint={t("cabinet.discordRolesHint")}>
              {roles.length ? (
                <span className="v2-cab-pills">
                  {roles.map((role) => (
                    <span
                      key={role.id}
                      className="v2-access-pill"
                      style={role.color ? { color: role.color, background: `color-mix(in srgb, ${role.color} 16%, transparent)` } : undefined}
                    >
                      {role.name}
                    </span>
                  ))}
                </span>
              ) : live && !discord ? (
                t("cabinet.discordNeedSync")
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
          <div className="v2-cab-idline is-mark">
            <span className="v2-mark-chip">
              <ScheduleSlot letters={letters} bg={markBg} fg={markFg} />
            </span>
            <div className="v2-cab-idcopy">
              <b>{letters || t("cabinet.markNone")}</b>
              <TipLabel text={t("cabinet.markTitle")} hint={t("cabinet.markHint")} />
            </div>
          </div>
          <div className="v2-cab-facts">
            <Fact label={t("cabinet.roomNick")} hint={t("cabinet.roomNickHint")}>
              {roomNick}
            </Fact>
            <Fact label={t("cabinet.joined")} hint={t("cabinet.joinedHint")}>
              {dayLabel(clubJoined, lang)}
            </Fact>
            {live ? null : <Fact label={t("cabinet.poolShare")}>{`${mine?.poolShare ?? 80}%`}</Fact>}
          </div>
          <div className="v2-cab-facts is-end">
            <Fact label={t("cabinet.communityTitle")} hint={t("cabinet.communityHint")}>
              {community ? t(`cabinet.community.${community}`) : "—"}
            </Fact>
          </div>
          <PermanentPriority nitro={vipNitro} regular={vipRegular} hideEmpty />
        </div>
        </div>
      </section>

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
          <Field label={t("cabinet.name")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder="—" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          </Field>
          <Field label={t("cabinet.birthday")}>
            <input className="v2-ctrl w-full px-2" type="date" disabled={!canEditCard} value={profile.birthday} onChange={(event) => setProfile({ ...profile, birthday: event.target.value })} />
          </Field>
          <Field label={t("cabinet.city")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder="—" value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
          </Field>
          <Field label={t("cabinet.country")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder="—" value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} />
          </Field>
          <label className="v2-cab-field">
            <TipLabel text={t("cabinet.extraUtc")} hint={t("cabinet.extraUtcHint")} />
            <select
              className="v2-ctrl v2-cab-tz w-full px-2"
              disabled={!canEditCard}
              value={profile.extraUtc}
              onChange={(event) => setProfile({ ...profile, extraUtc: Number(event.target.value) })}
            >
              {UTC_OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  {utcLabel(offset)}
                  {offset === 3 ? ` · ${t("header.mskLabel")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <Field label={t("cabinet.phone")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder="—" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
          </Field>
          <Field label={t("cabinet.telegram")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder="@username" value={profile.telegram} onChange={(event) => setProfile({ ...profile, telegram: event.target.value })} />
          </Field>
          <Field label={t("cabinet.contactAlt")}>
            <input className="v2-ctrl w-full px-2" disabled={!canEditCard} placeholder={t("cabinet.contactAltPh")} value={profile.contactAlt} onChange={(event) => setProfile({ ...profile, contactAlt: event.target.value })} />
          </Field>
        </div>
        <BlockBar
          editing
          dirty={profileDirty}
          saveLabel={t("cabinet.save")}
          cancelLabel={t("cabinet.cancel")}
          onSave={() => void saveProfile()}
          onCancel={() => setProfile({ ...savedProfile })}
        />
        </div>
      </section>

      <section className="v2-block v2-cab-card is-notify">
        <div className="v2-cab-head">
          <h2>{t("cabinet.notifyTitle")}</h2>
        </div>
        <div className="v2-cab-body">
          <p className="v2-cab-hint">{t("cabinet.notifyLead")}</p>
          <NotifyPicks value={channel} disabled={!canEditCard} onChange={setChannel} />
          <p className="v2-cab-note">
            <i className="fa-solid fa-bell" aria-hidden />
            <span>
              {channel === "telegram" && !profile.telegram
                ? t("cabinet.notifyNeedTelegram")
                : channel === "email" && !login.email
                  ? t("cabinet.notifyNeedEmail")
                  : t(`cabinet.notify.${channel}Note`)}
            </span>
          </p>
          <BlockBar
            editing
            dirty={channel !== savedChannel}
            saveLabel={t("cabinet.save")}
            cancelLabel={t("cabinet.cancel")}
            onSave={() => void saveNotify()}
            onCancel={() => setChannel(savedChannel)}
          />
        </div>
      </section>

      <CabinetLoginPanel
        discordOn
        discordHint={discordUser ? `@${discordUser}` : discordNick}
        login={login}
        saved={savedLogin}
        passwordSet={Boolean(mine?.passwordSet || savedLogin.password)}
        canEdit={canEditCard}
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
        canEdit={canEditCard}
        defaultNick={session.nick}
        onPlayId={setPlayId}
        onPatch={patchPlay}
        onPersist={persistPlays}
        onCancel={() => setPlays(clonePlays(savedPlays))}
      />

      <PayMethodsPanel
        memberId={session.memberId}
        canEdit={canEditCard}
        live={live}
        demoPays={live ? undefined : mine?.pays}
        seedKey={mine?.id ?? session.memberId}
        onDemoSave={(next) => writeMember({ pays: next })}
        onSaved={ping}
      />

      <section className="v2-block v2-cab-card">
        <div className="v2-cab-head">
          <h2>{t("cabinet.filterTitle")}</h2>
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
        <BlockBar
          editing
          dirty={prefsDirty}
          saveLabel={t("cabinet.save")}
          cancelLabel={t("cabinet.cancel")}
          onSave={saveSchedule}
          onCancel={() => setPrefs({ ...savedPrefs, limits: [...savedPrefs.limits] })}
        />
        </div>
      </section>

      <button type="button" className="v2-cab-out" onClick={onLogout}>
        {t("login.logout")}
      </button>
    </div>
  );
}
