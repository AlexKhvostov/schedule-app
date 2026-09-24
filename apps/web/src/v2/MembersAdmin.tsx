import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { isLiveData } from "../data/config";
import { refreshGuildRoster } from "../data/guild";
import {
  createClubCard,
  createRedPartyProfiles,
  blockClubProfile,
  dismissJoinRequest,
  discordPrimary,
  hasRoot,
  listAdminPeople,
  loadClubRequests,
  peopleRank,
  personTitle,
  restoreClubCard,
  reopenJoinRequest,
  saveMemberDistanceId,
  saveMemberMark,
  type AdminPerson,
  type ClubAccess,
  type ClubRequest,
} from "../data/people";
import { loadMemberRoomNicks, type MemberRoomNick } from "../data/plays";
import { loadClubPeopleSettings, saveSelfCreateCard, subscribeClubPeopleSettings } from "../data/clubSettings";
import { loadScheduleSettings, subscribeScheduleSettings } from "../data/scheduleSettings";
import { roomName } from "../schedule/rooms";
import { bestInk, cssToHex, parseMarkHex } from "../schedule/markCatalog";
import { hueOfBg, lettersBlocked, type ClubMember } from "../schedule/members";
import { AdminPersonCard } from "./AdminPersonCard";
import { ScheduleSlot, ScheduleSlotStrip } from "./ScheduleSlot";
import { PersonChip } from "./PersonAvatar";
import { catalogRoles, RolePick, RolePills } from "./RolePills";
import { readSession } from "./session";
import { loadTheme } from "./theme";
import { showV2Toast } from "./V2Toast";
import { V2SaveButton } from "./V2SaveButton";
import { MembersRoleSettings } from "./members/MembersRoleSettings";
import { MembersSystemSettings } from "./members/MembersSystemSettings";
import { DiscordSnapshotModal } from "./members/DiscordSnapshotModal";

type StatusFilter = "all" | "active" | "blocked" | "left" | "root" | "bot";
type SortKey = "access" | "nick" | "joined" | "color";
type PeopleTab = "profiles" | "requests" | "roles" | "discord" | "settings";

type RowDraft = {
  access: ClubAccess;
  distanceId: string;
};

function discordLine(row: AdminPerson) {
  const extra =
    row.globalName && row.globalName !== discordPrimary(row) && row.globalName !== row.username
      ? ` · ${row.globalName}`
      : "";
  return `@${row.username}${extra}`;
}

function savedDraft(row: AdminPerson): RowDraft {
  return {
    access: row.access,
    distanceId: row.distanceExtId ?? "",
  };
}

function sameDraft(a: RowDraft, b: RowDraft) {
  return (
    a.access === b.access &&
    a.distanceId.trim() === b.distanceId.trim()
  );
}

function markHue(row: AdminPerson) {
  if (!row.markTag) return 1000;
  return hueOfBg(row.markBg);
}

function roomNickLines(memberId: string | null, map: Map<string, MemberRoomNick[]>) {
  const have = memberId ? map.get(memberId) ?? [] : [];
  if (!have.some((row) => row.roomId === "winamax")) return [{ roomId: "winamax", nick: "" }, ...have];
  return [...have].sort((a, b) => Number(b.roomId === "winamax") - Number(a.roomId === "winamax"));
}

function PersonTip({
  row,
  rooms,
  children,
}: {
  row: AdminPerson;
  rooms: MemberRoomNick[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const place = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const height = 156 + Math.max(0, rooms.length - 1) * 52;
    const top = box.bottom + 8 + height > window.innerHeight ? Math.max(8, box.top - height - 8) : box.bottom + 6;
    setPos({ top, left: Math.min(Math.max(8, box.left), window.innerWidth - 268) });
  };

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(place, 180);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  const discordNick = row.globalName?.trim() || row.username;
  const serverNick = row.nick?.trim() || "";

  return (
    <div className="v2-mem-who" ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos
        ? createPortal(
            <div className={`v2-mem-who-tip theme-${loadTheme()}`} style={{ top: pos.top, left: pos.left }} role="tooltip">
              <p>
                <span>{t("admin.people.tipDiscord")}</span>
                <b>{discordNick}</b>
                {row.globalName && row.globalName !== row.username ? <small>@{row.username}</small> : null}
              </p>
              <p>
                <span>{t("admin.people.tipServer")}</span>
                <b className={serverNick ? undefined : "is-empty"}>{serverNick || "—"}</b>
              </p>
              {rooms.map((item) => (
                <p key={item.roomId}>
                  <span>{t("admin.people.tipRoom", { room: roomName(item.roomId) })}</span>
                  <b className={item.nick ? undefined : "is-empty"}>{item.nick || "—"}</b>
                </p>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function asMarkMember(row: AdminPerson): ClubMember {
  return {
    id: row.memberId ?? row.discordId,
    name: row.displayName ?? "",
    discord: personTitle(row),
    discordId: row.discordId,
    room: row.username,
    email: row.email ?? "",
    limits: [],
    status: row.accessStatus === "active" ? "active" : "pending",
    appAccess: row.accessStatus === "active",
    isAdmin: false,
    vipNitro: 0,
    vipRegular: 0,
    distance: 0,
    mark: { colorId: -1, t: row.markTag ?? "", bg: row.markBg, fg: row.markFg },
  };
}

function ColorWell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const hex = cssToHex(value);
  const [draft, setDraft] = useState(hex);
  const ok = Boolean(parseMarkHex(draft));

  useEffect(() => {
    setDraft(hex);
  }, [hex]);

  return (
    <div className="v2-mem-step">
      <span>{label}</span>
      <div className="v2-mem-hex-row">
        <label className="v2-mem-picker" title={t("admin.people.pickColor")}>
          <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} />
        </label>
        <input
          className={`v2-ctrl v2-mono v2-mark-hex px-2${ok ? "" : " is-bad"}`}
          value={draft}
          spellCheck={false}
          placeholder="#ffd966"
          title={ok ? t("admin.people.hexHint") : t("admin.people.hexErr")}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = parseMarkHex(next);
            if (parsed) onChange(parsed);
          }}
        />
      </div>
      {!ok ? <small className="v2-mark-err">{t("admin.people.hexErr")}</small> : null}
    </div>
  );
}

function MarkModal({
  member,
  list,
  showTables = false,
  onClose,
  onSave,
}: {
  member: ClubMember;
  list: ClubMember[];
  showTables?: boolean;
  onClose: () => void;
  onSave: (mark: ClubMember["mark"]) => void;
}) {
  const { t } = useTranslation();
  const [bg, setBg] = useState(cssToHex(member.mark.bg || "#76a5af"));
  const [fg, setFg] = useState(cssToHex(member.mark.fg || bestInk(member.mark.bg || "#76a5af")));
  const [letters, setLetters] = useState(member.mark.t);
  const bgOk = Boolean(parseMarkHex(bg));
  const fgOk = Boolean(parseMarkHex(fg));
  const tagErr = Boolean(letters.trim()) && lettersBlocked(list, letters, member.id);
  const canApply = (!letters.trim() || (bgOk && fgOk)) && !tagErr;

  return createPortal(
    <div className={`v2-mem-overlay theme-${loadTheme()}`} onClick={onClose}>
      <div className="v2-mem-modal is-mark" onClick={(event) => event.stopPropagation()}>
        <div>
          <span className="v2-admin-kicker block text-[11px] tracking-[0.16em] uppercase">{t("admin.people.markEdit")}</span>
          <h3 className="mt-1 text-[16px] font-semibold">{member.discord}</h3>
        </div>
        <p className="v2-muted mt-2 text-[12px] leading-snug">{t("admin.people.markHint")}</p>
        <div className="v2-mark-fields">
          <div className="v2-mem-step">
            <span>{t("admin.marks.slot")}</span>
            <span className="v2-opt is-kit v2-mark-sample">
              <ScheduleSlot letters={letters} bg={bg} fg={fg} tables={member.tables ?? 12} showTables={showTables} />
            </span>
          </div>
          <div className="v2-mem-step v2-mark-letters">
            <span>{t("admin.marks.tag")}</span>
            <input
              className="v2-ctrl v2-mono v2-mark-tag px-2"
              maxLength={3}
              value={letters}
              onChange={(event) => setLetters(event.target.value.trim().slice(0, 3).toUpperCase())}
            />
          </div>
          <ColorWell label={t("admin.people.colMark")} value={bg} onChange={setBg} />
          <ColorWell label={t("admin.marks.ink")} value={fg} onChange={setFg} />
        </div>
        {tagErr && <small className="v2-mark-err">{t("admin.marks.dupTag")}</small>}
        <div className="v2-mem-demo">
          <span>{t("admin.marks.preview")}</span>
          <ScheduleSlotStrip
            letters={letters}
            bg={bg}
            fg={fg}
            pastLabel={t("admin.marks.previewPast")}
            futureLabel={t("admin.marks.previewFuture")}
            lead={t("admin.marks.previewLead")}
            showTables={showTables}
          />
        </div>
        <div className="v2-mem-apply">
          <button type="button" className="v2-ctrl px-4" onClick={onClose}>
            {t("admin.people.cancel")}
          </button>
          <button
            type="button"
            className={`v2-ctrl px-5 font-semibold${canApply ? " is-on" : ""}`}
            disabled={!canApply}
            onClick={() => {
              if (!canApply) return;
              onSave({ colorId: -1, bg: cssToHex(bg), fg: cssToHex(fg), t: letters.trim().toUpperCase() });
            }}
          >
            {t("admin.capacity.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NickFilter({
  value,
  onChange,
  people,
}: {
  value: string;
  onChange: (value: string) => void;
  people: AdminPerson[];
}) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLLabelElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const hits = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q
      ? people.filter((row) =>
          [discordPrimary(row), row.username, row.globalName, row.nick, row.discordId, row.publicCode, row.displayName].filter(Boolean).join(" ").toLowerCase().includes(q),
        )
      : people;
    return list.slice(0, 8);
  }, [people, value]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <CompactField label={t("admin.people.filterNick")} ref={boxRef}>
      <Input
        value={value}
        placeholder={t("admin.people.filterNickPh")}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHi((i) => Math.min(hits.length - 1, i + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHi((i) => Math.max(0, i - 1));
          } else if (event.key === "Enter" && open && hits[hi]) {
            event.preventDefault();
            onChange(discordPrimary(hits[hi]));
            setOpen(false);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="v2-mem-suggest">
          {hits.map((row, index) => (
            <li key={row.discordId}>
              <button
                type="button"
                className={index === hi ? "is-on" : undefined}
                onMouseEnter={() => setHi(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(discordPrimary(row));
                  setOpen(false);
                }}
              >
                <b>{discordPrimary(row)}</b>
                <small>{discordLine(row)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CompactField>
  );
}

export function MembersAdmin() {
  const { t } = useTranslation();
  const selfMemberId = readSession()?.memberId;
  const [list, setList] = useState<AdminPerson[]>([]);
  const [asks, setAsks] = useState<ClubRequest[]>([]);
  const [roomNicks, setRoomNicks] = useState<Map<string, MemberRoomNick[]>>(new Map());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busyLoad, setBusyLoad] = useState(true);
  const [busyGuild, setBusyGuild] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [nickQ, setNickQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("access");
  const [showBots, setShowBots] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [markFor, setMarkFor] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [discordFor, setDiscordFor] = useState<string | null>(null);
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<PeopleTab>("profiles");
  const [snapshotRedPartyOnly, setSnapshotRedPartyOnly] = useState(true);
  const [countTables, setCountTables] = useState(false);
  const [selfCreate, setSelfCreate] = useState(false);
  const [selfCreateSaving, setSelfCreateSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const reload = async () => {
    if (!isLiveData()) {
      setList([]);
      setAsks([]);
      setRoomNicks(new Map());
      setBusyLoad(false);
      return;
    }
    const [people, requests] = await Promise.all([listAdminPeople(), loadClubRequests()]);
    const memberIds = people.map((row) => row.memberId).filter((id): id is string => Boolean(id));
    const nicks = await loadMemberRoomNicks(memberIds);
    setList(people);
    setAsks(requests);
    setRoomNicks(nicks);
    setBusyLoad(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    let live = true;
    const apply = () => {
      void loadScheduleSettings().then((next) => {
        if (live) setCountTables(next.countTables);
      });
    };
    apply();
    const off = subscribeScheduleSettings(apply);
    return () => {
      live = false;
      off();
    };
  }, []);

  useEffect(() => {
    let live = true;
    const apply = () => {
      void loadClubPeopleSettings().then((next) => {
        if (live) setSelfCreate(next.selfCreateCard);
      });
    };
    apply();
    const off = subscribeClubPeopleSettings(apply);
    return () => {
      live = false;
      off();
    };
  }, []);

  const pullDiscord = async () => {
    if (busyGuild) return;
    setBusyGuild(true);
    const next = await refreshGuildRoster();
    if (next.error) showV2Toast("err", t(`guild.err.${next.error}.title`));
    else showV2Toast("ok", t("admin.people.refreshOk"));
    await reload();
    setBusyGuild(false);
  };

  const setAccess = async (row: AdminPerson, access: ClubAccess) => {
    if (!row.memberId || hasRoot(row)) return;
    if (row.memberId === selfMemberId && access === "closed") return;
    setBusyId(row.discordId);
    const result = access === "closed" ? await blockClubProfile(row.memberId) : await restoreClubCard(row.memberId);
    if (result.error) {
      showV2Toast("err", t("admin.people.saveErr"));
      setBusyId("");
      return;
    }
    await reload();
    setBusyId("");
    showV2Toast(access === "closed" ? "off" : "ok", t("admin.saved"));
  };

  const makeCard = async (discordId: string) => {
    setBusyId(discordId);
    const result = await createClubCard(discordId);
    if (result.error) {
      showV2Toast("err", t("admin.people.saveErr"));
      setBusyId("");
      return;
    }
    await reload();
    setBusyId("");
    showV2Toast("ok", t("admin.people.cardCreated"));
  };

  const restoreCard = async (memberId: string, discordId: string) => {
    setBusyId(discordId);
    const result = await restoreClubCard(memberId);
    if (result.error) {
      showV2Toast("err", t("admin.people.saveErr"));
      setBusyId("");
      return;
    }
    await reload();
    setBusyId("");
    showV2Toast("ok", t("admin.people.cardRestored"));
  };

  const bulkCreate = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    const result = await createRedPartyProfiles();
    if (result.error) showV2Toast("err", t("admin.people.saveErr"));
    else showV2Toast("ok", t("admin.people.bulkCreated", { n: result.count }));
    await reload();
    setBulkBusy(false);
  };

  const shownOf = (row: AdminPerson) => drafts[row.discordId] ?? savedDraft(row);

  const patchRow = (row: AdminPerson, part: Partial<RowDraft>) => {
    const next = { ...shownOf(row), ...part };
    setDrafts((prev) => {
      const copy = { ...prev };
      if (sameDraft(next, savedDraft(row))) delete copy[row.discordId];
      else copy[row.discordId] = next;
      return copy;
    });
  };

  const saveRow = async (row: AdminPerson) => {
    const draft = shownOf(row);
    const saved = savedDraft(row);
    if (sameDraft(draft, saved)) return;
    if (hasRoot(row) && draft.access === "closed") return;
    if (row.memberId === selfMemberId && draft.access === "closed") return;
    setBusyId(row.discordId);
    const memberId = row.memberId;
    if (draft.distanceId.trim() !== (row.distanceExtId ?? "").trim()) {
      const distance = await saveMemberDistanceId(memberId, draft.distanceId, row.discordId);
      if (distance.error === "duplicate") {
        showV2Toast("err", t("admin.people.distanceIdDup"));
        setBusyId("");
        return;
      }
      if (distance.error === "bad-shape") {
        showV2Toast("err", t("admin.people.distanceIdBad"));
        setBusyId("");
        return;
      }
      if (distance.error) {
        showV2Toast("err", t("admin.people.saveErr"));
        setBusyId("");
        await reload();
        return;
      }
    }
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[row.discordId];
      return copy;
    });
    await reload();
    setBusyId("");
    showV2Toast("ok", t("admin.saved"));
  };

  const people = useMemo(() => {
    const profiles = list.filter((row) => Boolean(row.memberId));
    if (statusFilter === "bot" || showBots) return profiles;
    return profiles.filter((row) => !row.bot);
  }, [list, showBots, statusFilter]);
  const counts = useMemo(() => {
    const profiles = list.filter((row) => Boolean(row.memberId));
    const humans = profiles.filter((row) => !row.bot);
    const active = humans.filter((row) => row.accessStatus === "active").length;
    const blocked = humans.filter((row) => row.accessStatus === "blocked").length;
    const root = humans.filter((row) => hasRoot(row)).length;
    const left = humans.filter((row) => Boolean(row.memberId) && !row.onGuild).length;
    const bot = profiles.filter((row) => row.bot).length;
    return { all: humans.length + bot, active, blocked, root, bot, left };
  }, [list]);
  const rolePicked = useMemo(() => new Set(roleFilter), [roleFilter]);
  const roleCatalog = useMemo(() => {
    const all = catalogRoles(list);
    const here = catalogRoles(people);
    const nById = new Map(here.map((row) => [row.role.id, row.n]));
    return all.map((row) => ({ ...row, n: nById.get(row.role.id) ?? 0 }));
  }, [list, people]);
  const toggleRole = (id: string) => {
    setRoleFilter((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const rows = useMemo(() => {
    const q = nickQ.trim().toLowerCase();
    const copy = people.filter((row) => {
      if (statusFilter === "bot" && !row.bot) return false;
      if (row.bot && statusFilter !== "all" && statusFilter !== "bot") return false;
      if (statusFilter === "active" && row.accessStatus !== "active") return false;
      if (statusFilter === "blocked" && row.accessStatus !== "blocked") return false;
      if (statusFilter === "left" && !(row.memberId && !row.onGuild)) return false;
      if (statusFilter === "root" && !hasRoot(row)) return false;
      if (rolePicked.size && !row.discordRoles.some((role) => rolePicked.has(role.id))) return false;
      if (!q) return true;
      return [
        discordPrimary(row),
        row.username,
        row.globalName,
        row.nick,
        row.discordId,
        row.publicCode,
        row.displayName,
        row.distanceExtId,
        ...row.discordRoles.map((role) => role.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    copy.sort((a, b) => {
      if (sort === "joined") return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
      if (sort === "nick") return discordPrimary(a).localeCompare(discordPrimary(b), "ru");
      if (sort === "color") return markHue(a) - markHue(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
      return peopleRank(a) - peopleRank(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
    });
    return copy;
  }, [people, nickQ, statusFilter, sort, rolePicked]);

  const editing = list.find((row) => (row.memberId ?? row.discordId) === markFor) ?? null;
  const profile = list.find((row) => row.discordId === profileFor) ?? null;
  const discordPerson = list.find((row) => row.discordId === discordFor) ?? null;
  const shownAsks = showRequestHistory ? asks : asks.filter((ask) => ask.status === "open");
  const bulkEligible = list.filter(
    (row) =>
      row.onGuild &&
      !row.bot &&
      !row.memberId &&
      row.discordRoles.some((role) => role.id === "1208022351652986891"),
  ).length;
  const snapshotRows = list.filter(
    (row) =>
      (showBots || !row.bot) &&
      (!snapshotRedPartyOnly || row.discordRoles.some((role) => role.id === "1208022351652986891")),
  );

  return (
    <div className="v2-people-pad">
      <div className="v2-people-bar">
        <h2>{t("nav.adminPeople")}</h2>
      </div>
      {!isLiveData() ? (
        <div className="v2-guild-empty mt-6">
          <i className="fa-brands fa-discord" />
          <h2>{t("admin.people.needLive.title")}</h2>
          <p className="v2-muted">{t("admin.people.needLive.lead")}</p>
        </div>
      ) : (
        <>
          <nav className="v2-people-tabs" aria-label={t("admin.people.tabsLabel")}>
            {([
              ["profiles", "fa-address-card", t("admin.people.tabProfiles"), people.length],
              ["requests", "fa-inbox", t("admin.people.tabRequests"), asks.filter((ask) => ask.status === "open").length],
              ["roles", "fa-shield-halved", t("admin.people.tabRoles"), null],
              ["discord", "fa-brands fa-discord", t("admin.people.tabDiscord"), snapshotRows.length],
              ["settings", "fa-sliders", t("admin.people.tabSettings"), null],
            ] as [PeopleTab, string, string, number | null][]).map(([key, icon, label, count]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? "is-on" : undefined}
                aria-current={activeTab === key ? "page" : undefined}
                onClick={() => setActiveTab(key)}
              >
                <i className={icon.startsWith("fa-brands") ? icon : `fa-solid ${icon}`} />
                <span>{label}</span>
                {count !== null ? <small>{count}</small> : null}
              </button>
            ))}
          </nav>

          <div className="v2-people-stack">
          {activeTab === "profiles" ? (
          <section className="v2-people-section v2-profiles-section">
            <header className="v2-people-section-head">
              <span className="v2-people-section-icon"><i className="fa-solid fa-address-card" /></span>
              <span>
                <b>{t("admin.people.profilesTitle")}</b>
                <small>{t("admin.people.profilesLead")}</small>
              </span>
              <span className="v2-section-count">{people.length}</span>
            </header>
          <div className="v2-mem-filters">
            <NickFilter value={nickQ} onChange={setNickQ} people={people} />
            <CompactField label={t("admin.people.colAccess")}>
              <NativeSelect className="w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                {(["all", "active", "blocked", "left", "root", "bot"] as const).map((key) => (
                  <option key={key} value={key}>
                    {t(`admin.people.accessFilter.${key}`)} · {counts[key]}
                  </option>
                ))}
              </NativeSelect>
            </CompactField>
            <div className="v2-field">
              <span>{t("admin.people.colRoles")}</span>
              <RolePick
                roles={roleCatalog}
                picked={rolePicked}
                onToggle={toggleRole}
                label={t("admin.people.colRoles")}
                emptyLabel={t("admin.people.filterRolesAll")}
              />
            </div>
            <CompactField label={t("admin.people.sortLabel")}>
              <NativeSelect className="w-full" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                {(["access", "nick", "color", "joined"] as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {t(`admin.people.sort.${key}`)}
                  </option>
                ))}
              </NativeSelect>
            </CompactField>
            <div className="v2-mem-filter-extra">
              <label className="v2-mem-check">
                <input type="checkbox" checked={showBots} onChange={(event) => setShowBots(event.target.checked)} />
                <span>{t("admin.people.showBots")}</span>
              </label>
            </div>
          </div>
          <div className="v2-club-scroll">
            <table className="v2-mem-table v2-club-table">
              <colgroup>
                <col className="v2-mem-col-person" />
                <col className="v2-mem-col-mark" />
                <col className="v2-mem-col-status" />
                <col className="v2-mem-col-roles" />
                <col className="v2-mem-col-dist" />
                <col className="v2-mem-col-save" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t("admin.people.colPerson")}</th>
                  <th className="v2-mem-h-mark">{t("admin.people.colMark")}</th>
                  <th>{t("admin.people.colAccess")}</th>
                  <th title={t("admin.people.colRolesHint")}>{t("admin.people.colRoles")}</th>
                  <th className="v2-mem-h-dist" title={t("admin.people.distanceIdHint")}>
                    {t("admin.people.colDist")}
                  </th>
                  <th className="v2-mem-h-save" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = shownOf(row);
                  const dirty = !sameDraft(draft, savedDraft(row));
                  const closedLocked = hasRoot(row) || row.memberId === selfMemberId;
                  const rowLocked = row.bot || !row.memberId;
                  return (
                    <tr key={row.discordId} className={row.accessStatus !== "active" || row.bot || (row.memberId && !row.onGuild) ? "is-dim" : undefined}>
                      <td>
                        <PersonTip row={row} rooms={roomNickLines(row.memberId, roomNicks)}>
                          <PersonChip
                            src={row.avatarUrl}
                            name={discordPrimary(row)}
                            sub={`${discordLine(row)}${row.bot ? ` · ${t("admin.people.access.bot")}` : ""}${row.memberId && !row.onGuild ? ` · ${t("admin.people.leftGuild")}` : ""}`}
                            onClick={() => setProfileFor(row.discordId)}
                          />
                        </PersonTip>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`v2-mem-mark${row.markTag ? "" : " is-empty"}`}
                          title={t("admin.people.markEdit")}
                          aria-label={t("admin.people.markEdit")}
                          onClick={() => {
                            if (!row.memberId) {
                              showV2Toast("err", t("admin.people.noCard"));
                              return;
                            }
                            setMarkFor(row.memberId);
                          }}
                        >
                          <ScheduleSlot letters={row.markTag ?? ""} bg={row.markBg} fg={row.markFg} tables={row.tables ?? 12} showTables={countTables} />
                        </button>
                      </td>
                      <td>
                        {row.bot ? (
                          <i className="v2-club-bot">{t("admin.people.access.bot")}</i>
                        ) : row.memberId ? (
                          <span className="v2-mem-status-cell">
                            <span className="v2-mem-status-line">
                              <b className={`v2-profile-state is-${row.accessStatus ?? "blocked"}`}>
                                {row.accessStatus === "active" ? t("admin.people.profileActive") : t("admin.people.profileBlocked")}
                              </b>
                              {!closedLocked ? (
                                <button
                                  type="button"
                                  className="v2-ctrl v2-status-action"
                                  disabled={busyId === row.discordId || (row.accessStatus !== "active" && !row.onGuild)}
                                  onClick={() => void setAccess(row, row.accessStatus === "active" ? "closed" : "member")}
                                >
                                  {row.accessStatus === "active" ? t("admin.people.blockProfile") : t("admin.people.restoreCard")}
                                </button>
                              ) : null}
                            </span>
                            <span className="v2-mem-status-notes">
                              {hasRoot(row) ? <i className="v2-club-root">{t("admin.root.roleRoot")}</i> : null}
                              {row.onGuild ? null : <i className="v2-club-left">{t("admin.people.leftGuild")}</i>}
                              {row.blockReason ? <small>{t(`admin.people.blockReason.${row.blockReason}`)}</small> : null}
                            </span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="v2-ctrl v2-mem-create"
                            disabled={busyId === row.discordId}
                            onClick={() => void makeCard(row.discordId)}
                          >
                            {t("admin.people.createCard")}
                          </button>
                        )}
                      </td>
                      <td>
                        <RolePills roles={row.accessDiscordRoles} max={99} />
                      </td>
                      <td>
                        <Input
                          className="v2-mem-dist"
                          value={draft.distanceId}
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="—"
                          disabled={rowLocked || busyId === row.discordId}
                          title={t("admin.people.distanceIdHint")}
                          aria-label={t("admin.people.distanceId")}
                          onChange={(event) =>
                            patchRow(row, { distanceId: event.target.value.replace(/\D/g, "").slice(0, 12) })
                          }
                        />
                      </td>
                      <td>
                        <V2SaveButton
                          icon
                          dirty={dirty}
                          disabled={busyId === row.discordId}
                          label={t("admin.save")}
                          onClick={() => void saveRow(row)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && !busyLoad && (
                  <tr>
                    <td colSpan={6} className="v2-muted py-4 text-center text-[12px]">
                      {list.length ? t("admin.people.empty") : t("admin.people.noSnapshot")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </section>
          ) : null}

          {activeTab === "requests" ? (
          <section className="v2-people-section v2-requests-section">
            <header className="v2-people-section-head">
              <span className="v2-people-section-icon"><i className="fa-solid fa-inbox" /></span>
              <span>
                <b>{t("admin.people.asksTitle", { n: asks.filter((ask) => ask.status === "open").length })}</b>
                <small>{t("admin.people.requestsLead")}</small>
              </span>
            </header>
            <div className="v2-people-asks">
              <div className="v2-requests-tools">
                <label className="v2-mem-check">
                  <input type="checkbox" checked={showRequestHistory} onChange={(event) => setShowRequestHistory(event.target.checked)} />
                  <span>{t("admin.people.requestsHistory")}</span>
                </label>
                <button
                  type="button"
                  className="v2-ctrl v2-primary-action"
                  disabled={bulkBusy || bulkEligible === 0}
                  onClick={() => void bulkCreate()}
                >
                  <i className={`fa-solid fa-users-gear${bulkBusy ? " fa-spin" : ""}`} />
                  {t("admin.people.bulkCreateShort")}
                  <span className="v2-action-count">{bulkEligible}</span>
                </button>
              </div>
              {shownAsks.map((ask) => (
                <div key={ask.id} className="v2-people-ask">
                  <span>
                    {ask.displayName || ask.username || ask.discordId}
                    <i>{ask.kind === "restore" ? t("admin.people.askRestore") : t("admin.people.askJoin")} · {ask.status}</i>
                  </span>
                  {ask.status !== "open" ? null : ask.kind === "restore" && ask.memberId ? (
                    <button type="button" className="v2-ctrl v2-primary-action" disabled={busyId === ask.discordId} onClick={() => void restoreCard(ask.memberId as string, ask.discordId)}>
                      {t("admin.people.restoreCard")}
                    </button>
                  ) : (
                    <button type="button" className="v2-ctrl v2-primary-action" disabled={busyId === ask.discordId} onClick={() => void makeCard(ask.discordId)}>
                      {t("admin.people.createCard")}
                    </button>
                  )}
                  {ask.status === "open" ? <button
                    type="button"
                    className="v2-ctrl"
                    title={t("admin.people.askDismiss")}
                    onClick={() => {
                      void dismissJoinRequest(ask.id).then(() => reload());
                    }}
                  >
                    {t("admin.people.askDismiss")}
                  </button> : ask.status === "dismissed" ? (
                    <button type="button" className="v2-ctrl" onClick={() => void reopenJoinRequest(ask.id).then(() => reload())}>
                      {t("admin.people.requestReopen")}
                    </button>
                  ) : null}
                </div>
              ))}
              {!shownAsks.length ? <span className="v2-muted text-[12px]">{t("admin.people.requestsEmpty")}</span> : null}
            </div>
          </section>
          ) : null}

          {activeTab === "discord" ? (
          <section className="v2-people-section v2-discord-snapshot">
            <header className="v2-people-section-head">
              <span className="v2-people-section-icon"><i className="fa-brands fa-discord" /></span>
              <span>
                <b>{t("admin.people.snapshotTitle")}</b>
                <small>{t("admin.people.snapshotLead", { n: snapshotRows.length })}</small>
              </span>
            </header>
            <div className="v2-snapshot-tools">
              <label className="v2-mem-check">
                <input
                  type="checkbox"
                  checked={snapshotRedPartyOnly}
                  onChange={(event) => setSnapshotRedPartyOnly(event.target.checked)}
                />
                <span>{t("admin.people.snapshotRedPartyOnly")}</span>
              </label>
              <button
                type="button"
                className="v2-ctrl v2-discord-refresh"
                disabled={busyGuild}
                title={t("admin.people.refreshHint")}
                onClick={() => void pullDiscord()}
              >
                <i className={`fa-solid fa-rotate${busyGuild ? " fa-spin" : ""}`} />
                {busyGuild ? t("admin.people.refreshDiscordBusy") : t("admin.people.refreshDiscord")}
              </button>
            </div>
            <div className="v2-snapshot-list">
              {snapshotRows.map((row) => (
                <button key={row.discordId} type="button" onClick={() => setDiscordFor(row.discordId)}>
                  <PersonChip
                    src={row.avatarUrl}
                    name={discordPrimary(row)}
                    sub={`@${row.username} · ${row.onGuild ? t("admin.people.onServer") : t("admin.people.leftGuild")}`}
                  />
                  <span className="v2-snapshot-meta">
                    <RolePills roles={row.discordRoles} max={4} />
                    <small>
                      {row.discordId}
                      {row.joinedAt ? ` · ${t("admin.people.snapshotJoined")}: ${new Date(row.joinedAt).toLocaleDateString()}` : ""}
                    </small>
                  </span>
                  <span
                    className={`v2-snapshot-redparty${row.discordRoles.some((role) => role.id === "1208022351652986891") ? " is-on" : " is-off"}`}
                    title={t("admin.people.snapshotRedPartyRole")}
                  >
                    <i className={`fa-solid ${row.discordRoles.some((role) => role.id === "1208022351652986891") ? "fa-square-check" : "fa-square-xmark"}`} />
                    RedParty
                  </span>
                  <span className={`v2-snapshot-action${row.memberId ? " is-done" : " is-create"}`}>
                    <i className={`fa-solid ${row.memberId ? "fa-circle-check" : "fa-user-plus"}`} />
                    {row.memberId ? t("admin.people.profileExists") : t("admin.people.createCard")}
                  </span>
                </button>
              ))}
            </div>
          </section>
          ) : null}

          {activeTab === "roles" ? <MembersRoleSettings /> : null}
          {activeTab === "settings" ? (
            <MembersSystemSettings
              selfCreate={selfCreate}
              saving={selfCreateSaving}
              onChange={(next) => {
                setSelfCreate(next);
                setSelfCreateSaving(true);
                void saveSelfCreateCard(next).then((result) => {
                  setSelfCreateSaving(false);
                  if (result.error) {
                    setSelfCreate(!next);
                    showV2Toast("err", t("admin.people.saveErr"));
                  } else showV2Toast("ok", t("admin.saved"));
                });
              }}
            />
          ) : null}
        </div>
        </>
      )}

      {editing?.memberId && (
        <MarkModal
          member={asMarkMember(editing)}
          list={list.filter((row) => row.memberId).map(asMarkMember)}
          showTables={countTables}
          onClose={() => setMarkFor(null)}
          onSave={(mark) => {
            const memberId = editing.memberId;
            if (!memberId) return;
            void saveMemberMark(memberId, { tag: mark.t || null, bg: mark.bg || "#76a5af", fg: mark.fg }).then((result) => {
              if (result.error) showV2Toast("err", t("admin.people.saveErr"));
              else {
                showV2Toast("ok", t("admin.saved"));
                void reload();
              }
              setMarkFor(null);
            });
          }}
        />
      )}
      {profile && (
        <AdminPersonCard
          person={profile}
          people={list}
          selfMemberId={selfMemberId}
          busy={busyId === profile.discordId}
          onClose={() => setProfileFor(null)}
          onAccess={(access) => void setAccess(profile, access)}
          onCreateCard={() => void makeCard(profile.discordId)}
          onMark={() => setMarkFor(profile.memberId ?? profile.discordId)}
          onReload={() => void reload()}
          countTables={countTables}
        />
      )}
      {discordPerson && (
        <DiscordSnapshotModal
          person={discordPerson}
          busy={busyId === discordPerson.discordId}
          onClose={() => setDiscordFor(null)}
          onCreate={() => void makeCard(discordPerson.discordId)}
        />
      )}
    </div>
  );
}
