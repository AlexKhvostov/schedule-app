import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CompactField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { isLiveData } from "../data/config";
import { loadCachedRoster, refreshGuildRoster } from "../data/guild";
import {
  discordPrimary,
  listAdminPeople,
  personTitle,
  saveMemberDistanceId,
  saveMemberMark,
  setDiscordAccess,
  type AdminPerson,
  type ClubAccess,
} from "../data/people";
import { loadMemberRoomNicks, type MemberRoomNick } from "../data/plays";
import { loadScheduleAccessMap, saveScheduleAccess, type ScheduleAccessKey } from "../data/scheduleAccess";
import { LIMIT_OPTIONS, formatLimit } from "../schedule/capacity";
import { roomName } from "../schedule/rooms";
import { bestInk, cssToHex, parseMarkHex } from "../schedule/markCatalog";
import { hueOfBg, lettersBlocked, type ClubMember } from "../schedule/members";
import { AdminPersonCard } from "./AdminPersonCard";
import { ScheduleSlot, ScheduleSlotStrip } from "./ScheduleSlot";
import { PersonChip } from "./PersonAvatar";
import { readSession } from "./session";
import { loadTheme } from "./theme";
import { showV2Toast } from "./V2Toast";
import { V2SaveButton } from "./V2SaveButton";

type StatusFilter = "club" | "all" | "closed" | "member" | "admin" | "bot";
type SortKey = "access" | "nick" | "joined" | "color";

type RowDraft = {
  access: ClubAccess;
  nitro: string[];
  regular: string[];
  distanceId: string;
};

function discordLine(row: AdminPerson) {
  const extra =
    row.globalName && row.globalName !== discordPrimary(row) && row.globalName !== row.username
      ? ` · ${row.globalName}`
      : "";
  return `@${row.username}${extra}`;
}

function limitsOf(keys: ScheduleAccessKey[] | undefined, variant: "nitro" | "regular") {
  return (keys ?? [])
    .filter((row) => row.variant === variant)
    .map((row) => row.limit)
    .sort((a, b) => Number(a) - Number(b));
}

function savedDraft(row: AdminPerson, accessMap: Map<string, ScheduleAccessKey[]>): RowDraft {
  const keys = row.memberId ? accessMap.get(row.memberId) : undefined;
  return {
    access: row.access,
    nitro: limitsOf(keys, "nitro"),
    regular: limitsOf(keys, "regular"),
    distanceId: row.distanceExtId ?? "",
  };
}

function sameDraft(a: RowDraft, b: RowDraft) {
  return (
    a.access === b.access &&
    a.nitro.join() === b.nitro.join() &&
    a.regular.join() === b.regular.join() &&
    a.distanceId.trim() === b.distanceId.trim()
  );
}

function markHue(row: AdminPerson) {
  if (!row.markTag) return 1000;
  return hueOfBg(row.markBg);
}

function LimitPick({
  values,
  disabled,
  label,
  onChange,
}: {
  values: string[];
  disabled?: boolean;
  label: string;
  onChange: (next: string[]) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      setPos({
        top: Math.min(box.bottom + 4, window.innerHeight - 228),
        left: Math.min(box.left, window.innerWidth - 220),
      });
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const hide = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  const summary = values.length
    ? `${values.slice(0, 3).map((limit) => formatLimit(limit)).join(" · ")}${values.length > 3 ? ` +${values.length - 3}` : ""}`
    : "—";

  return (
    <div className="v2-mem-pick">
      <button
        ref={btnRef}
        type="button"
        className={`v2-ctrl v2-mem-pick-btn${open ? " is-open" : ""}`}
        disabled={disabled}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
        <i className="fa-solid fa-angle-down" />
      </button>
      {open && !disabled
        ? createPortal(
            <div ref={popRef} className={`v2-mem-pick-pop theme-${loadTheme()}`} style={{ top: pos.top, left: pos.left }}>
              <b>{label}</b>
              <div className="v2-mem-pick-grid">
                {LIMIT_OPTIONS.map((limit) => {
                  const on = values.includes(limit);
                  return (
                    <button
                      key={limit}
                      type="button"
                      className={on ? "is-on" : undefined}
                      onClick={() =>
                        onChange(on ? values.filter((item) => item !== limit) : [...values, limit].sort((a, b) => Number(a) - Number(b)))
                      }
                    >
                      {formatLimit(limit)}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
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
    status: row.access === "closed" ? "pending" : "active",
    appAccess: row.access !== "closed",
    isAdmin: row.access === "admin" || row.access === "root",
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
  onClose,
  onSave,
}: {
  member: ClubMember;
  list: ClubMember[];
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
              <ScheduleSlot letters={letters} bg={bg} fg={fg} tables={member.tables ?? 12} />
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

export function MembersAdmin({ isRoot }: { isRoot?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const selfMemberId = readSession()?.memberId;
  const [list, setList] = useState<AdminPerson[]>([]);
  const [accessMap, setAccessMap] = useState<Map<string, ScheduleAccessKey[]>>(new Map());
  const [roomNicks, setRoomNicks] = useState<Map<string, MemberRoomNick[]>>(new Map());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busyLoad, setBusyLoad] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [nickQ, setNickQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("club");
  const [sort, setSort] = useState<SortKey>("access");
  const [showBots, setShowBots] = useState(false);
  const [markFor, setMarkFor] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);

  const reload = async () => {
    if (!isLiveData()) {
      setList([]);
      setAccessMap(new Map());
      setRoomNicks(new Map());
      setBusyLoad(false);
      return;
    }
    const [people, roster] = await Promise.all([listAdminPeople(), loadCachedRoster()]);
    const memberIds = people.map((row) => row.memberId).filter((id): id is string => Boolean(id));
    const [map, nicks] = await Promise.all([loadScheduleAccessMap(memberIds), loadMemberRoomNicks(memberIds)]);
    setList(people);
    setAccessMap(map);
    setRoomNicks(nicks);
    setSyncedAt(roster?.fetchedAt ?? null);
    setBusyLoad(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const setAccess = async (row: AdminPerson, access: "closed" | "member" | "admin") => {
    if (row.access === "root") return;
    if (row.memberId && row.memberId === selfMemberId && access === "closed") return;
    setBusyId(row.discordId);
    const result = await setDiscordAccess(row.discordId, access);
    if (result.error) {
      showV2Toast("err", t("admin.people.saveErr"));
      setBusyId("");
      return;
    }
    await reload();
    setBusyId("");
    showV2Toast(access === "closed" ? "off" : "ok", t(`admin.people.accessToast.${access}`));
  };

  const shownOf = (row: AdminPerson) => drafts[row.discordId] ?? savedDraft(row, accessMap);

  const patchRow = (row: AdminPerson, part: Partial<RowDraft>) => {
    const next = { ...shownOf(row), ...part };
    setDrafts((prev) => {
      const copy = { ...prev };
      if (sameDraft(next, savedDraft(row, accessMap))) delete copy[row.discordId];
      else copy[row.discordId] = next;
      return copy;
    });
  };

  const saveRow = async (row: AdminPerson) => {
    const draft = shownOf(row);
    const saved = savedDraft(row, accessMap);
    if (sameDraft(draft, saved)) return;
    if (row.access === "root" && draft.access !== "root") return;
    if (row.memberId === selfMemberId && draft.access === "closed") return;
    setBusyId(row.discordId);
    if (draft.access !== row.access && row.access !== "root" && draft.access !== "root") {
      const result = await setDiscordAccess(row.discordId, draft.access);
      if (result.error) {
        showV2Toast("err", t("admin.people.saveErr"));
        setBusyId("");
        return;
      }
    }
    let memberId = row.memberId;
    if (!memberId && draft.access !== "closed") {
      const people = await listAdminPeople();
      memberId = people.find((item) => item.discordId === row.discordId)?.memberId ?? null;
    }
    if (memberId) {
      const keys: ScheduleAccessKey[] = [
        ...draft.nitro.map((limit) => ({ variant: "nitro" as const, limit })),
        ...draft.regular.map((limit) => ({ variant: "regular" as const, limit })),
      ];
      const accessResult = await saveScheduleAccess(memberId, keys);
      if (accessResult.error) {
        showV2Toast("err", t("admin.people.saveErr"));
        setBusyId("");
        await reload();
        return;
      }
      if (draft.distanceId.trim() !== (row.distanceExtId ?? "").trim()) {
        const distance = await saveMemberDistanceId(memberId, draft.distanceId);
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
    if (statusFilter === "bot" || showBots) return list;
    return list.filter((row) => !row.bot);
  }, [list, showBots, statusFilter]);
  const counts = useMemo(() => {
    const humans = list.filter((row) => !row.bot);
    const closed = humans.filter((row) => row.access === "closed").length;
    const member = humans.filter((row) => row.access === "member").length;
    const admin = humans.filter((row) => row.access === "admin" || row.access === "root").length;
    const bot = list.filter((row) => row.bot).length;
    return { all: humans.length + bot, club: member + admin, closed, member, admin, bot };
  }, [list]);

  const rows = useMemo(() => {
    const q = nickQ.trim().toLowerCase();
    const copy = people.filter((row) => {
      if (statusFilter === "bot" && !row.bot) return false;
      if (row.bot && statusFilter !== "all" && statusFilter !== "bot") return false;
      if (statusFilter === "club" && row.access === "closed") return false;
      if (statusFilter === "closed" && row.access !== "closed") return false;
      if (statusFilter === "member" && row.access !== "member") return false;
      if (statusFilter === "admin" && row.access !== "admin" && row.access !== "root") return false;
      if (!q) return true;
      return [discordPrimary(row), row.username, row.globalName, row.nick, row.discordId, row.publicCode, row.displayName, row.distanceExtId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    copy.sort((a, b) => {
      if (sort === "joined") return (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "");
      if (sort === "nick") return discordPrimary(a).localeCompare(discordPrimary(b), "ru");
      if (sort === "color") return markHue(a) - markHue(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
      const rank = (row: AdminPerson) => {
        if (row.bot) return 4;
        if (row.access === "root") return 0;
        if (row.access === "admin") return 1;
        if (row.access === "member") return 2;
        return 3;
      };
      return rank(a) - rank(b) || discordPrimary(a).localeCompare(discordPrimary(b), "ru");
    });
    return copy;
  }, [people, nickQ, statusFilter, sort]);

  const editing = list.find((row) => (row.memberId ?? row.discordId) === markFor) ?? null;
  const profile = list.find((row) => row.discordId === profileFor) ?? null;

  return (
    <div className="v2-people-pad px-5 py-5">
      <p className="v2-muted max-w-3xl text-[13px] leading-relaxed">{t("admin.people.lead")}</p>
      {syncedAt ? (
        <p className="v2-muted mt-1 text-[12px]">
          {t("guild.synced", {
            time: new Date(syncedAt).toLocaleString(lang === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
          })}
        </p>
      ) : null}

      {!isLiveData() ? (
        <div className="v2-guild-empty mt-6">
          <i className="fa-brands fa-discord" />
          <h2>{t("admin.people.needLive.title")}</h2>
          <p className="v2-muted">{t("admin.people.needLive.lead")}</p>
        </div>
      ) : (
        <>
          <div className="v2-mem-filters">
            <NickFilter value={nickQ} onChange={setNickQ} people={people} />
            <CompactField label={t("admin.people.colAccess")}>
              <NativeSelect className="w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                {(["club", "all", "closed", "member", "admin", "bot"] as const).map((key) => (
                  <option key={key} value={key}>
                    {t(`admin.people.accessFilter.${key}`)} · {counts[key]}
                  </option>
                ))}
              </NativeSelect>
            </CompactField>
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
              {isRoot ? (
                <button
                  type="button"
                  className="v2-guild-refresh"
                  disabled={busyLoad}
                  title={t("admin.people.refreshHint")}
                  aria-label={t("guild.refresh")}
                  onClick={() => {
                    setBusyLoad(true);
                    void refreshGuildRoster().then(() => reload());
                  }}
                >
                  <i className={`fa-solid fa-rotate${busyLoad ? " fa-spin" : ""}`} />
                  {busyLoad ? t("guild.loading") : t("guild.refresh")}
                </button>
              ) : null}
            </div>
          </div>
          <div className="v2-club-scroll">
            <table className="v2-mem-table v2-club-table">
              <colgroup>
                <col className="v2-mem-col-person" />
                <col className="v2-mem-col-mark" />
                <col className="v2-mem-col-status" />
                <col className="v2-mem-col-access" />
                <col className="v2-mem-col-access" />
                <col className="v2-mem-col-dist" />
                <col className="v2-mem-col-save" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t("admin.people.colPerson")}</th>
                  <th className="v2-mem-h-mark">{t("admin.people.colMark")}</th>
                  <th>{t("admin.people.colAccess")}</th>
                  <th className="v2-mem-h-access" title={t("admin.people.colNitroHint")}>
                    <b>{t("admin.people.colNitro")}</b>
                    <small>{t("admin.people.colScheduleAccess")}</small>
                  </th>
                  <th className="v2-mem-h-access" title={t("admin.people.colRegularHint")}>
                    <b>{t("admin.people.colRegular")}</b>
                    <small>{t("admin.people.colScheduleAccess")}</small>
                  </th>
                  <th className="v2-mem-h-dist" title={t("admin.people.distanceIdHint")}>
                    {t("admin.people.colDist")}
                  </th>
                  <th className="v2-mem-h-save" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = shownOf(row);
                  const dirty = !sameDraft(draft, savedDraft(row, accessMap));
                  const statusLocked = row.access === "root" || row.memberId === selfMemberId;
                  const limitsLocked = row.bot || (!row.memberId && draft.access === "closed");
                  return (
                    <tr key={row.discordId} className={row.access === "closed" || row.bot ? "is-dim" : undefined}>
                      <td>
                        <PersonTip row={row} rooms={roomNickLines(row.memberId, roomNicks)}>
                          <PersonChip
                            src={row.avatarUrl}
                            name={discordPrimary(row)}
                            sub={`${discordLine(row)}${row.bot ? ` · ${t("admin.people.access.bot")}` : ""}`}
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
                          <ScheduleSlot letters={row.markTag ?? ""} bg={row.markBg} fg={row.markFg} tables={row.tables ?? 12} />
                        </button>
                      </td>
                      <td>
                        {row.bot ? (
                          <i className="v2-club-bot">{t("admin.people.access.bot")}</i>
                        ) : row.access === "root" ? (
                          <i className="v2-club-root">{t("admin.root.roleRoot")}</i>
                        ) : (
                          <NativeSelect
                            className="v2-mem-status w-full"
                            value={draft.access}
                            disabled={statusLocked || busyId === row.discordId}
                            onChange={(event) => patchRow(row, { access: event.target.value as ClubAccess })}
                          >
                            <option value="closed">{t("admin.people.access.closed")}</option>
                            <option value="member">{t("admin.people.access.member")}</option>
                            <option value="admin">{t("admin.people.access.admin")}</option>
                          </NativeSelect>
                        )}
                      </td>
                      <td>
                        <LimitPick
                          label={t("admin.people.colNitroHint")}
                          values={draft.nitro}
                          disabled={limitsLocked || busyId === row.discordId}
                          onChange={(nitro) => patchRow(row, { nitro })}
                        />
                      </td>
                      <td>
                        <LimitPick
                          label={t("admin.people.colRegularHint")}
                          values={draft.regular}
                          disabled={limitsLocked || busyId === row.discordId}
                          onChange={(regular) => patchRow(row, { regular })}
                        />
                      </td>
                      <td>
                        <Input
                          className="v2-mem-dist"
                          value={draft.distanceId}
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="—"
                          disabled={limitsLocked || busyId === row.discordId}
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
                    <td colSpan={7} className="v2-muted py-8 text-center text-[13px]">
                      {list.length ? t("admin.people.empty") : t("admin.people.noSnapshot")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing?.memberId && (
        <MarkModal
          member={asMarkMember(editing)}
          list={list.filter((row) => row.memberId).map(asMarkMember)}
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
          onMark={() => setMarkFor(profile.memberId ?? profile.discordId)}
          onReload={() => void reload()}
        />
      )}
    </div>
  );
}
