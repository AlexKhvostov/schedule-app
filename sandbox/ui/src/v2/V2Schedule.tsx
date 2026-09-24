import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit, type CapacityMap } from "../schedule/capacity";
import { ME, markKey, markLabel, vipOf, type Mark } from "../schedule/marks";
import { emptyMonth, patchSeat, type Occupancy } from "../schedule/plan";
import { monthShort, monthTitle } from "../schedule/formatDate";
import { readCet } from "../schedule/cet";
import { rosterFromGrids, type RosterRow } from "../schedule/roster";
import { fieldFill, pctLabel } from "../schedule/analytics";
import { OptField } from "./OptField";
import { V2Float } from "./V2Float";
import { V2MyCalendar } from "./V2MyCalendar";
import { V2Settings } from "./V2Settings";
import { V2UserCard } from "./V2UserCard";
import { ScheduleSlot } from "./ScheduleSlot";
import { PersonAvatar } from "./PersonAvatar";
import { showV2Toast } from "./V2Toast";
import { gridsForCalendar, limitsWithMyMarks, myHoursMatrix, myPlayStats, myTimeline } from "./myShifts";
import { type HourLoadMap } from "../schedule/hourLoad";
import { loadPrefs, savePrefs } from "./prefs";
import { isLiveData } from "../data/config";
import { loadLiveMember } from "../data/auth";
import { saveMemberTables, loadPublicNames } from "../data/people";
import { listLimitMarks, listSchedulePlayers, markFromPlayer, type SchedulePlayer } from "../data/players";
import { loadMyPlays } from "../data/plays";
import { accessKey, loadScheduleAccess } from "../data/scheduleAccess";
import { loadMonthGrids, placeSlot, removeSlot, subscribeOccupancy } from "../data/slots";
import { loadMembers, memberOfSession, saveMembers, winamaxPlayLimits } from "../schedule/members";
import { readSession } from "./session";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
  capacity: CapacityMap;
  hourLoad?: HourLoadMap;
  skin?: "classic" | "theme";
  memberId?: string;
  canActAs?: boolean;
  onKindChange?: (kind: "nitro" | "regular") => void;
};

function playerQuery(row: SchedulePlayer) {
  return `${row.nick} ${row.markTag} ${row.publicCode}`.toLowerCase();
}

function isClubCode(value?: string | null) {
  return Boolean(value && /^RP-[0-9A-Fa-f]{6}$/i.test(value.trim()));
}

function showNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "";
  return text;
}

function faceRoster(rows: RosterRow[]): RosterRow[] {
  if (isLiveData()) return rows;
  const people = loadMembers();
  return rows.map((row) => {
    const person = people.find((item) => (row.mark.t && item.mark.t === row.mark.t) || item.discord === row.mark.discord);
    if (!person) return row;
    return {
      ...row,
      mark: {
        ...row.mark,
        memberId: person.id,
        avatarUrl: person.avatar || row.mark.avatarUrl,
        vipNitro: person.vipNitro || row.mark.vipNitro,
        vipRegular: person.vipRegular || row.mark.vipRegular,
      },
    };
  });
}

function rowInitials(nick: string, mark: string) {
  const letters = nick.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = letters.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (mark.trim()) return mark.trim().slice(0, 2).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function ActAsPicker({
  players,
  selfId,
  actingId,
  onPick,
}: {
  players: SchedulePlayer[];
  selfId?: string;
  actingId?: string;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const current = players.find((row) => row.id === actingId) ?? players.find((row) => row.id === selfId);
  const needle = query.trim().toLowerCase();
  const shown = [...players]
    .sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId) || a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }))
    .filter((row) => !needle || playerQuery(row).includes(needle));

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!players.length) return null;

  return (
    <div className="v2-mark-dock-who" ref={boxRef}>
      <span>{t("schedule.actAsLabel")}</span>
      <button
        type="button"
        className={`v2-mark-dock-who-hit${actingId && selfId && actingId !== selfId ? " is-other" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <b>{current ? (current.markTag || "—") : "—"}</b>
        <em>{current?.nick ?? t("schedule.actAsSelf")}</em>
        {current && selfId && current.id === selfId ? <small>{t("schedule.actAsSelf")}</small> : null}
        <i className="fa-solid fa-angle-down" aria-hidden />
      </button>
      {open ? (
        <div className="v2-mark-dock-who-menu">
          <input
            value={query}
            placeholder={t("schedule.actAsSearch")}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <ul>
            {shown.length ? (
              shown.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={row.id === actingId ? "is-on" : ""}
                    onClick={() => {
                      onPick(row.id);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <b>{row.markTag || "—"}</b>
                    <em>{row.nick}</em>
                    {row.id === selfId ? <small>{t("schedule.actAsSelf")}</small> : <small>{row.publicCode}</small>}
                  </button>
                </li>
              ))
            ) : (
              <li className="is-empty">{t("schedule.actAsEmpty")}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MarkPlanDock({
  me,
  tables,
  matrix,
  x,
  y,
  onMove,
  onBump,
  onDraft,
  canActAs,
  players,
  selfId,
  actingId,
  onActAs,
}: {
  me: Mark;
  tables: string;
  matrix: ReturnType<typeof myHoursMatrix>;
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  onBump: (delta: number) => void;
  onDraft: (value: string) => void;
  canActAs?: boolean;
  players: SchedulePlayer[];
  selfId?: string;
  actingId?: string;
  onActAs: (id: string) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const n = Number(tables) || me.tables;
  const cols = matrix.limits;

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return;
      onMove(
        Math.min(window.innerWidth - 72, Math.max(8, event.clientX - drag.current.ox)),
        Math.min(window.innerHeight - 48, Math.max(8, event.clientY - drag.current.oy)),
      );
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onMove]);

  return createPortal(
    <div
      className={`v2-mark-dock${canActAs && actingId && selfId && actingId !== selfId ? " is-proxy" : ""}`}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={t("schedule.editDockTitle")}
    >
      <header
        className="v2-mark-dock-head"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("input, button, .v2-mark-dock-who")) return;
          drag.current = { ox: event.clientX - x, oy: event.clientY - y };
        }}
      >
        <div className="v2-mark-dock-title">
          <b>
            {canActAs && actingId && selfId && actingId !== selfId
              ? t("schedule.editDockAs", { nick: me.discord })
              : t("schedule.editDockTitle")}
          </b>
          <i className="fa-solid fa-grip-vertical" aria-hidden />
        </div>
        {canActAs ? (
          <ActAsPicker players={players} selfId={selfId} actingId={actingId} onPick={onActAs} />
        ) : null}
        <div className="v2-mark-dock-tools">
          <span className="v2-mark-sample">
            <ScheduleSlot letters={me.t} bg={me.bg} fg={me.fg} tables={n} />
          </span>
          <div className="v2-mark-dock-step" title={t("schedule.markCardTables")}>
            <button type="button" aria-label="−1" onClick={() => onBump(-1)}>
              <i className="fa-solid fa-minus" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={tables}
              onChange={(event) => onDraft(event.target.value)}
            />
            <button type="button" aria-label="+1" onClick={() => onBump(1)}>
              <i className="fa-solid fa-plus" />
            </button>
          </div>
          <em>{t("schedule.meHours", { n: matrix.grand })}</em>
        </div>
      </header>
      <ul className="v2-mark-dock-stat">
        {cols.map((limit) => {
          const marks = matrix.counts[limit] || 0;
          const hours = matrix.totals[limit] || 0;
          return (
            <li key={limit} className={marks ? "is-on" : ""}>
              <b>{formatLimit(limit)}</b>
              <em>{t("schedule.planMarks", { n: marks })}</em>
              <i>{t("schedule.meHours", { n: hours })}</i>
            </li>
          );
        })}
      </ul>
      {cols.length ? (
        <>
      <p className="v2-mark-plan-note">{t("schedule.planTableHint")}</p>
      <div className="v2-mark-plan-scroll">
        <table className="v2-mark-plan">
          <thead>
            <tr>
              <th>{t("schedule.planDay")}</th>
              {cols.map((limit) => (
                <th key={limit}>{limit}</th>
              ))}
              <th className="is-sum">Σ</th>
            </tr>
          </thead>
          <tbody>
            {matrix.hours.map((row, dayIdx) => (
              <tr key={dayIdx}>
                <th>{String(dayIdx + 1).padStart(2, "0")}</th>
                {cols.map((limit) => (
                  <td key={limit} className={row[limit] ? "is-on" : ""}>
                    {row[limit] || ""}
                  </td>
                ))}
                <td className={`is-sum${matrix.dayTotals[dayIdx] ? " is-on" : ""}`}>{matrix.dayTotals[dayIdx] || ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Σ</th>
              {cols.map((limit) => (
                <td key={limit} className={matrix.totals[limit] ? "is-on" : ""}>
                  {matrix.totals[limit] || ""}
                </td>
              ))}
              <td className={`is-sum${matrix.grand ? " is-on" : ""}`}>{matrix.grand || ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>
        </>
      ) : (
        <p className="v2-mark-plan-note">{t("schedule.planLimitsEmpty")}</p>
      )}
    </div>,
    document.body,
  );
}

function seatDiffs(prev: Occupancy, next: Occupancy) {
  const out: {
    day: number;
    half: number;
    level: number;
    placed: boolean;
    tables: number;
    undone: Occupancy[number][number][number];
  }[] = [];
  for (let dayIdx = 0; dayIdx < next.length; dayIdx += 1) {
    for (let half = 0; half < 48; half += 1) {
      const before = prev[dayIdx]?.[half] ?? [];
      const after = next[dayIdx]?.[half] ?? [];
      const max = Math.max(before.length, after.length);
      for (let level = 0; level < max; level += 1) {
        if ((before[level]?.t ?? "") !== (after[level]?.t ?? "")) {
          out.push({
            day: dayIdx + 1,
            half,
            level,
            placed: Boolean(after[level]),
            tables: after[level]?.tables ?? before[level]?.tables ?? 1,
            undone: before[level] ?? null,
          });
        }
      }
    }
  }
  return out;
}

export function V2Schedule({ cursor, onCursorChange, capacity, hourLoad, skin = "theme", memberId, canActAs = false, onKindChange }: Props) {
  const { t, i18n } = useTranslation();
  const isKit = skin === "theme";
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const boot = loadPrefs();
  const [grids, setGrids] = useState<Record<string, Occupancy>>(() =>
    Object.fromEntries(boot.limits.map((limit) => [limit, emptyMonth(year, monthIndex)])),
  );
  const [readyStamp, setReadyStamp] = useState("");
  const [showMine, setShowMine] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selfMark, setSelfMark] = useState<Mark>({ ...ME });
  const [me, setMe] = useState<Mark>({ ...ME });
  const [actingId, setActingId] = useState<string | undefined>(memberId);
  const [players, setPlayers] = useState<SchedulePlayer[]>([]);
  const actingRef = useRef<string | undefined>(memberId);
  const accessRef = useRef<Set<string>>(new Set());
  const selfMarkRef = useRef(selfMark);
  selfMarkRef.current = selfMark;
  const [hideTables, setHideTables] = useState(false);
  const [dimPast, setDimPast] = useState(true);
  const [hidePastDays, setHidePastDays] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editPulse, setEditPulse] = useState(boot.editPulse);
  const [showExtraTz, setShowExtraTz] = useState(boot.showExtraTz !== false);
  const [markOpen, setMarkOpen] = useState(false);
  const [tablesDraft, setTablesDraft] = useState("11");
  const [limits, setLimits] = useState<string[]>(boot.limits);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [kind, setKind] = useState(boot.kind);
  const [kindOpen, setKindOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year);
  const [focus, setFocus] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [peek, setPeek] = useState<RosterRow | null>(null);
  const [limitMarks, setLimitMarks] = useState<Mark[] | null>(null);
  const [publicNames, setPublicNames] = useState<Map<string, string>>(() => new Map());
  const [analyticsPos, setAnalyticsPos] = useState({ x: 760, y: 120 });
  const [peoplePos, setPeoplePos] = useState({ x: 1080, y: 160 });
  const [markPos, setMarkPos] = useState(() => ({
    x: typeof window === "undefined" ? 860 : Math.max(8, window.innerWidth - 408),
    y: 72,
  }));
  const [front, setFront] = useState<"fill" | "people">("fill");
  const [cetTick, setCetTick] = useState(() => readCet());
  const limitsRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const editPackRef = useRef<HTMLDivElement>(null);
  const tablesInputRef = useRef<HTMLInputElement>(null);
  const loadGen = useRef(0);
  const gridsRef = useRef(grids);
  const inflight = useRef(0);
  const refreshTimer = useRef(0);
  const tablesSaveTimer = useRef(0);
  gridsRef.current = grids;
  const sessionNick = readSession()?.nick ?? "";
  const selfId = memberId ?? memberOfSession(loadMembers(), { memberId, nick: sessionNick })?.id;
  actingRef.current = actingId || selfId;
  const [playLimits, setPlayLimits] = useState<string[]>(() =>
    winamaxPlayLimits({ memberId: actingRef.current, nick: sessionNick }),
  );
  const fetchLimits = useMemo(() => {
    const set = new Set([...limits, ...playLimits]);
    return LIMIT_OPTIONS.filter((item) => set.has(item));
  }, [limits, playLimits]);
  const fetchKey = fetchLimits.join("|");
  const loadStamp = `${year}-${monthIndex}-${kind}-${fetchKey}`;
  const gridLoading = isLiveData() && readyStamp !== loadStamp;
  const shownGrids = useMemo(() => {
    if (!gridLoading) return grids;
    return Object.fromEntries((fetchLimits.length ? fetchLimits : limits).map((limit) => [limit, emptyMonth(year, monthIndex)]));
  }, [gridLoading, grids, fetchLimits, limits, year, monthIndex]);

  useEffect(() => {
    setPlayLimits(winamaxPlayLimits({ memberId: actingId || selfId, nick: me.discord || sessionNick }));
  }, [actingId, selfId, me.discord, sessionNick, canEdit, markOpen]);

  useEffect(() => {
    const id = actingId || selfId;
    if (!isLiveData() || !id) {
      accessRef.current = new Set();
      return;
    }
    let live = true;
    void loadScheduleAccess(id).then((rows) => {
      if (!live) return;
      accessRef.current = new Set(rows.map((row) => accessKey(row.variant, row.limit)));
    });
    return () => {
      live = false;
    };
  }, [actingId, selfId]);

  useEffect(() => {
    const blank = Object.fromEntries(fetchLimits.map((limit) => [limit, emptyMonth(year, monthIndex)]));
    if (!isLiveData()) {
      setGrids(blank);
      setReadyStamp(loadStamp);
      return;
    }
    const gen = ++loadGen.current;
    void loadMonthGrids(year, monthIndex, kind, fetchLimits)
      .then((next) => {
        if (gen !== loadGen.current) return;
        if (next) setGrids(next);
        else setGrids(blank);
        setReadyStamp(loadStamp);
      })
      .catch(() => {
        if (gen !== loadGen.current) return;
        setReadyStamp(loadStamp);
      });
  }, [year, monthIndex, kind, fetchKey]);

  useEffect(() => {
    const applySelf = (mark: Mark, id?: string) => {
      setSelfMark(mark);
      setActingId((current) => {
        if (current && id && current !== id) return current;
        setMe(mark);
        setTablesDraft(String(mark.tables));
        return id ?? current;
      });
    };
    if (isLiveData()) {
      void loadLiveMember().then(async (member) => {
        if (!member) return;
        const plays = await loadMyPlays(member.id);
        const roomNick = plays.find((play) => play.roomId === "winamax")?.nick.trim() ?? "";
        applySelf(
          {
            t: member.markTag ?? "",
            discord: /^RP-/i.test(member.nick) ? "" : member.nick,
            room: roomNick,
            bg: member.markBg,
            fg: member.markFg,
            tables: member.tables,
          },
          member.id,
        );
      });
      return;
    }
    const row = memberOfSession(loadMembers(), { memberId, nick: sessionNick });
    if (!row) return;
    applySelf(markFromPlayer({
      id: row.id,
      nick: row.discord,
      publicCode: row.room,
      roomNick: row.room,
      markTag: row.mark.t,
      markBg: row.mark.bg || ME.bg,
      markFg: row.mark.fg || "#111827",
      tables: row.tables ?? 11,
    }), row.id);
  }, [memberId, sessionNick]);

  useEffect(() => {
    if (!isLiveData()) return;
    return subscribeOccupancy(() => {
      if (inflight.current > 0) return;
      void loadMonthGrids(year, monthIndex, kind, fetchLimits).then((next) => {
        if (next && inflight.current === 0) setGrids(next);
      });
    });
  }, [year, monthIndex, kind, fetchKey]);

  useEffect(() => {
    return () => {
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(tablesSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setCetTick(readCet()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!limitsOpen && !kindOpen && !monthOpen) return;
    const close = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!limitsRef.current?.contains(node)) setLimitsOpen(false);
      if (!kindRef.current?.contains(node)) setKindOpen(false);
      if (!monthRef.current?.contains(node)) setMonthOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLimitsOpen(false);
        setKindOpen(false);
        setMonthOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [limitsOpen, kindOpen, monthOpen]);

  useEffect(() => {
    if (!canEdit) {
      setMarkOpen(false);
      setActingId(selfId);
      setMe(selfMarkRef.current);
      setTablesDraft(String(selfMarkRef.current.tables));
    }
  }, [canEdit, selfId]);

  useEffect(() => {
    if (!canActAs || !canEdit) return;
    void listSchedulePlayers().then((rows) => {
      if (selfId && !rows.some((row) => row.id === selfId)) {
        const self = selfMarkRef.current;
        rows = [
          {
            id: selfId,
            nick: self.discord,
            publicCode: self.room,
            roomNick: self.room,
            markTag: self.t,
            markBg: self.bg,
            markFg: self.fg,
            tables: self.tables,
          },
          ...rows,
        ];
      }
      setPlayers(rows);
    });
  }, [canActAs, canEdit]);

  useEffect(() => {
    if (!markOpen) return;
    setTablesDraft(String(me.tables));
    const id = window.setTimeout(() => tablesInputRef.current?.focus(), 0);
    if (isKit) return () => window.clearTimeout(id);
    const close = (event: MouseEvent) => {
      if (!editPackRef.current?.contains(event.target as Node)) setMarkOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", close);
    };
  }, [markOpen, isKit]);

  const visibleGrids = useMemo(() => limits.map((limit) => shownGrids[limit]).filter(Boolean), [shownGrids, limits]);
  const fieldMarks = useMemo(() => {
    const seen = new Map<string, Mark>();
    for (const grid of visibleGrids) {
      for (const row of grid) {
        for (const cell of row) {
          for (const mark of cell) {
            if (mark && !seen.has(markKey(mark))) seen.set(markKey(mark), mark);
          }
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.t.localeCompare(b.t));
  }, [visibleGrids]);

  useEffect(() => {
    let alive = true;
    void listLimitMarks(kind, limits).then((rows) => {
      if (alive) setLimitMarks(rows);
    });
    return () => {
      alive = false;
    };
  }, [kind, limits]);

  const roster = useMemo(
    () =>
      faceRoster(
        rosterFromGrids(
          limits
            .map((limit) => ({ limit, grid: shownGrids[limit] }))
            .filter((row): row is { limit: string; grid: Occupancy } => Boolean(row.grid)),
          year,
          monthIndex,
          cetTick,
          limitMarks ?? undefined,
          kind,
        ),
      ),
    [shownGrids, limits, year, monthIndex, cetTick, limitMarks, kind],
  );

  useEffect(() => {
    if (!showPeople) {
      setPeek(null);
      return;
    }
    if (!isLiveData()) return;
    const ids = [...new Set(roster.map((row) => row.mark.memberId).filter((id): id is string => Boolean(id)))];
    let alive = true;
    void loadPublicNames(ids).then((next) => {
      if (alive) setPublicNames(next);
    });
    return () => {
      alive = false;
    };
  }, [showPeople, roster]);
  const fill = useMemo(() => {
    const empty = { pct: 0, taken: 0, seats: 0, futurePct: 0, futureTaken: 0, futureSeats: 0 };
    return visibleGrids.reduce((acc, grid, index) => {
      const row = fieldFill(
        grid,
        year,
        monthIndex,
        cetTick,
        limits[index] ?? "",
        undefined,
        capacity,
      );
      acc.taken += row.taken;
      acc.seats += row.seats;
      acc.futureTaken += row.futureTaken;
      acc.futureSeats += row.futureSeats;
      acc.pct = acc.seats ? acc.taken / acc.seats : 0;
      acc.futurePct = acc.futureSeats ? acc.futureTaken / acc.futureSeats : 0;
      return acc;
    }, empty);
  }, [visibleGrids, year, monthIndex, cetTick, limits, capacity]);
  const mineByLimit = useMemo(
    () =>
      limits.map((limit) => ({
        limit,
        ...myPlayStats(shownGrids[limit] ? { [limit]: shownGrids[limit] } : {}, me, year, monthIndex, cetTick),
      })),
    [shownGrids, limits, me, year, monthIndex, cetTick],
  );
  const allGrids = useMemo(() => gridsForCalendar(shownGrids, year, monthIndex), [shownGrids, year, monthIndex]);
  const dockLimits = useMemo(() => {
    const marked = limitsWithMyMarks(shownGrids, me);
    const source = playLimits.length ? playLimits : marked.length ? marked : limits;
    const set = new Set([...source, ...marked]);
    return LIMIT_OPTIONS.filter((limit) => set.has(limit));
  }, [playLimits, shownGrids, me, limits]);
  const planMatrix = useMemo(() => (isKit ? myHoursMatrix(shownGrids, me, dockLimits) : null), [isKit, shownGrids, me, dockLimits]);
  const busyMap = useMemo(
    () => (isKit && canEdit ? myTimeline(allGrids, me) : undefined),
    [isKit, canEdit, allGrids, me],
  );

  const applyActAs = (id: string) => {
    if (selfId && id === selfId) {
      setActingId(selfId);
      setMe(selfMarkRef.current);
      setTablesDraft(String(selfMarkRef.current.tables));
      return;
    }
    const row = players.find((item) => item.id === id);
    if (!row) return;
    const mark = markFromPlayer(row);
    setActingId(row.id);
    setMe(mark);
    setTablesDraft(String(mark.tables));
  };

  const onGridChange = useCallback(
    (limit: string, next: Occupancy) => {
      const prevGrid = gridsRef.current[limit] ?? [];
      const diffs = seatDiffs(prevGrid, next);
      setGrids((prev) => ({ ...prev, [limit]: next }));
      if (!diffs.length) return;
      const writeId = actingRef.current;
      if (isLiveData() && diffs.some((diff) => diff.placed) && !accessRef.current.has(accessKey(kind, limit))) {
        setGrids((prev) => ({ ...prev, [limit]: prevGrid }));
        showV2Toast("err", t("schedule.toastNoAccess"));
        return;
      }
      showV2Toast(diffs[0].placed ? "ok" : "off", t(diffs[0].placed ? "schedule.toastPlaced" : "schedule.toastRemoved"));
      if (!isLiveData() || !writeId) return;
      window.clearTimeout(refreshTimer.current);
      for (const diff of diffs) {
        const payload = {
          memberId: writeId,
          limit,
          variant: kind,
          year,
          monthIndex,
          day: diff.day,
          half: diff.half,
          level: diff.level,
          tables: diff.tables,
        };
        inflight.current += 1;
        void (diff.placed ? placeSlot(payload) : removeSlot(payload))
          .then(({ error }) => {
            inflight.current = Math.max(0, inflight.current - 1);
            if (error) {
              setGrids((curr) => {
                const grid = curr[limit];
                if (!grid) return curr;
                return { ...curr, [limit]: patchSeat(grid, diff.day - 1, diff.half, diff.level, diff.undone) };
              });
              showV2Toast("err", error.includes("no schedule access") ? t("schedule.toastNoAccess") : t("schedule.toastSaveError"));
              return;
            }
            if (inflight.current === 0) {
              refreshTimer.current = window.setTimeout(() => {
                if (inflight.current > 0) return;
                void loadMonthGrids(year, monthIndex, kind, fetchLimits).then((fresh) => {
                  if (fresh && inflight.current === 0) setGrids(fresh);
                });
              }, 280);
            }
          })
          .catch(() => {
            inflight.current = Math.max(0, inflight.current - 1);
            setGrids((curr) => {
              const grid = curr[limit];
              if (!grid) return curr;
              return { ...curr, [limit]: patchSeat(grid, diff.day - 1, diff.half, diff.level, diff.undone) };
            });
            showV2Toast("err", t("schedule.toastSaveError"));
          });
      }
    },
    [kind, monthIndex, year, fetchLimits, t],
  );

  const toggleLimit = (value: string) => {
    setLimits((prev) => {
      if (prev.includes(value)) return prev.length === 1 ? prev : prev.filter((item) => item !== value);
      return [...prev, value].sort((a, b) => Number(a) - Number(b));
    });
    setGrids((prev) => (prev[value] ? prev : { ...prev, [value]: emptyMonth(year, monthIndex) }));
  };

  const shiftMonth = (delta: number) => onCursorChange(new Date(year, monthIndex + delta, 1));

  const applyTables = (raw: number) => {
    const next = Math.min(30, Math.max(1, Math.round(raw)));
    const targetId = actingRef.current;
    setMe((mark) => (mark.tables === next ? mark : { ...mark, tables: next }));
    setTablesDraft(String(next));
    if (selfId && targetId === selfId) {
      setSelfMark((mark) => (mark.tables === next ? mark : { ...mark, tables: next }));
    }
    setPlayers((list) => list.map((row) => (row.id === targetId ? { ...row, tables: next } : row)));
    window.clearTimeout(tablesSaveTimer.current);
    tablesSaveTimer.current = window.setTimeout(() => {
      if (!targetId) return;
      if (isLiveData()) {
        void saveMemberTables(targetId, next).then((result) => {
          if (result.error) showV2Toast("err", t("schedule.toastSaveError"));
        });
        return;
      }
      const list = loadMembers();
      saveMembers(list.map((row) => (row.id === targetId ? { ...row, tables: next } : row)));
    }, 400);
  };

  const bumpTables = (delta: number) => {
    const n = Number(tablesDraft);
    const cur = Number.isFinite(n) ? n : me.tables;
    applyTables(cur + delta);
  };

  const commitTables = () => {
    const n = Number(tablesDraft);
    applyTables(Number.isFinite(n) ? n : me.tables);
    setMarkOpen(false);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section
        className={`v2-sched-bar flex h-10 shrink-0 items-center gap-2 border-b px-4${canEdit ? " is-edit" : ""}${editPulse ? "" : " is-quiet"}`}
        style={{ borderColor: canEdit ? "transparent" : undefined }}
      >
        <button type="button" className="v2-ctrl w-8" onClick={() => shiftMonth(-1)} aria-label="prev">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <div className="relative" ref={monthRef}>
          <button
            type="button"
            className="v2-ctrl min-w-[142px] justify-between px-3 font-semibold"
            aria-expanded={monthOpen}
            aria-haspopup="dialog"
            aria-label={t("schedule.pickMonth")}
            onClick={() => {
              setMonthOpen((open) => {
                const next = !open;
                if (next) setPickYear(year);
                return next;
              });
              setLimitsOpen(false);
              setKindOpen(false);
            }}
          >
            {monthTitle(year, monthIndex, i18n.language)}
            <i className="fa-regular fa-calendar v2-muted ml-2" />
          </button>
          {monthOpen && (
            <div className="v2-month-pop" role="dialog" aria-label={t("schedule.pickMonth")}>
              <div className="v2-month-pop-year">
                <button type="button" aria-label={t("schedule.prevYear")} onClick={() => setPickYear((value) => value - 1)}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <b>{pickYear}</b>
                <button type="button" aria-label={t("schedule.nextYear")} onClick={() => setPickYear((value) => value + 1)}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
              <div className="v2-month-pop-grid">
                {Array.from({ length: 12 }, (_, index) => {
                  const on = pickYear === year && index === monthIndex;
                  const now = new Date();
                  const isNow = pickYear === now.getFullYear() && index === now.getMonth();
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`${on ? "is-on" : ""}${isNow ? " is-now" : ""}`}
                      onClick={() => {
                        onCursorChange(new Date(pickYear, index, 1));
                        setMonthOpen(false);
                      }}
                    >
                      {monthShort(index, i18n.language)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button type="button" className="v2-ctrl w-8" onClick={() => shiftMonth(1)} aria-label="next">
          <i className="fa-solid fa-chevron-right" />
        </button>
        <div className="relative" ref={limitsRef}>
          <button
            type="button"
            className="v2-ctrl px-3"
            onClick={() => {
              setLimitsOpen((open) => !open);
              setKindOpen(false);
              setMonthOpen(false);
            }}
          >
            Лимит: <span className="v2-mono ml-1">{limits.join(" · ")}</span>
            <i className="fa-solid fa-angle-down v2-muted ml-2" />
          </button>
          {limitsOpen && (
            <div className="v2-bar-menu">
              {LIMIT_OPTIONS.map((value) => {
                const on = limits.includes(value);
                return (
                  <button key={value} type="button" className={on ? "is-on" : ""} onClick={() => toggleLimit(value)}>
                    <i className={`fa-solid ${on ? "fa-check-square" : "fa-square"}`} />
                    <span className="v2-mono">{value}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="relative" ref={kindRef}>
          <button
            type="button"
            className="v2-ctrl px-3"
            onClick={() => {
              setKindOpen((open) => !open);
              setLimitsOpen(false);
              setMonthOpen(false);
            }}
          >
            {kind === "nitro" ? "Nitro" : "Regular"}
            <i className="fa-solid fa-angle-down v2-muted ml-2" />
          </button>
          {kindOpen && (
            <div className="v2-bar-menu">
              {(
                [
                  ["nitro", "Nitro"],
                  ["regular", "Regular"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={kind === value ? "is-on" : ""}
                  onClick={() => {
                    setKind(value);
                    setKindOpen(false);
                    savePrefs({ ...loadPrefs(), kind: value });
                    onKindChange?.(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <form className="v2-mark-find relative shrink-0" onSubmit={(e) => e.preventDefault()}>
          <i className="fa-solid fa-magnifying-glass v2-muted pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px]" />
          <input
            className={`v2-ctrl v2-mark-find-input${focus.trim() ? " has-q" : ""}`}
            list="v2-marks"
            maxLength={4}
            placeholder="Aa"
            title={t("v2.search.hint")}
            aria-label={t("v2.search.hint")}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          {focus.trim() ? (
            <button
              type="button"
              className="v2-muted absolute top-1/2 right-0.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[10px] hover:text-[var(--foreground)]"
              title={t("v2.search.clear")}
              aria-label={t("v2.search.clear")}
              onClick={() => setFocus("")}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
          <datalist id="v2-marks">
            {fieldMarks.filter((mark) => mark.t).map((mark) => (
              <option key={markKey(mark)} value={mark.t} />
            ))}
          </datalist>
        </form>
        <div className="v2-bar-groups ml-auto">
        <div className="v2-bar-pack v2-tools-pack">
          <button type="button" className="v2-ctrl w-8" title={t("schedule.myCalendar")} onClick={() => { setShowMine(true); setShowSettings(false); }}>
            <i className="fa-regular fa-calendar" />
          </button>
          <button
            type="button"
            className="v2-ctrl w-8"
            title={t("schedule.analytics")}
            onClick={() => {
              setShowAnalytics((open) => !open);
              setFront("fill");
            }}
          >
            <i className="fa-solid fa-chart-column" />
          </button>
          <button
            type="button"
            className="v2-ctrl w-8"
            title={t("schedule.players")}
            onClick={() => {
              setShowPeople((open) => !open);
              setFront("people");
            }}
          >
            <i className="fa-solid fa-users" />
          </button>
          <button
            type="button"
            className="v2-ctrl w-8"
            title={t("schedule.settings")}
            onClick={() => {
              setShowSettings(true);
              setShowMine(false);
            }}
          >
            <i className="fa-solid fa-gear" />
          </button>
        </div>
        <div className={`v2-bar-pack v2-edit-pack${canEdit ? " is-on" : ""}${editPulse ? "" : " is-quiet"}`} ref={editPackRef}>
          <button
            type="button"
            className={`v2-edit-toggle${canEdit ? " is-on" : ""}`}
            role="switch"
            aria-checked={canEdit}
            title={t("schedule.editModeHint")}
            onClick={() => {
              const on = !canEdit;
              setCanEdit(on);
              if (isKit || canActAs) setMarkOpen(on);
            }}
          >
            <span className="v2-edit-switch" aria-hidden />
            <span>{t("schedule.editMode")}</span>
          </button>
          {isKit ? null : (
            <>
          <div className="v2-mark-sample">
              <button
                type="button"
                className="v2-mark-setup"
                title={canEdit ? t("schedule.markCardTables") : t("schedule.editModeHint")}
                aria-label={`${me.t} ${me.tables}`}
                aria-expanded={markOpen}
                onClick={() => {
                  if (!canEdit) return;
                  setMarkOpen((open) => !open);
                }}
                onContextMenu={(event) => event.preventDefault()}
              >
                <ScheduleSlot letters={me.t} bg={me.bg} fg={me.fg} tables={me.tables} />
              </button>
          </div>
          {markOpen && (
            <div className="v2-mark-card" role="dialog" aria-label={t("schedule.markCardName")}>
              {canActAs ? (
                <ActAsPicker players={players} selfId={selfId} actingId={actingId || selfId} onPick={applyActAs} />
              ) : null}
              <div className="v2-mark-card-top">
                <ScheduleSlot letters={me.t} bg={me.bg} fg={me.fg} tables={Number(tablesDraft) || me.tables} />
                <div>
                  <span>{t("schedule.markCardName")}</span>
                  <strong>{me.t}</strong>
                </div>
              </div>
              <p className="v2-mark-card-label">{t("schedule.markCardTables")}</p>
              <div className="v2-mark-card-step">
                <button type="button" className="v2-mark-card-btn" aria-label="−1" onClick={() => bumpTables(-1)}>
                  <i className="fa-solid fa-minus" />
                </button>
                <input
                  ref={tablesInputRef}
                  className="v2-mark-card-n"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={tablesDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTablesDraft(value);
                    if (!value.trim()) return;
                    const n = Number(value);
                    if (Number.isFinite(n)) applyTables(n);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitTables();
                    if (event.key === "Escape") setMarkOpen(false);
                  }}
                />
                <button type="button" className="v2-mark-card-btn" aria-label="+1" onClick={() => bumpTables(1)}>
                  <i className="fa-solid fa-plus" />
                </button>
              </div>
                <button type="button" className="v2-mark-card-ok" onClick={commitTables}>
                  {t("schedule.markCardOk")}
                </button>
            </div>
          )}
            </>
          )}
        </div>
        <div className="v2-bar-pack v2-me-stat" title={t("schedule.meStatHint")}>
          {mineByLimit.map((row) => (
            <span key={row.limit}>
              <b>{formatLimit(row.limit)}</b>
              <em>{t("schedule.meHours", { n: row.hours })}</em>
              <i>{t("schedule.meLeft", { n: row.left })}</i>
            </span>
          ))}
        </div>
        </div>
      </section>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={gridLoading}>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <OptField
          year={year}
          monthIndex={monthIndex}
          me={me}
          showTables={!hideTables}
          dimPast={dimPast}
          hidePastDays={hidePastDays}
          showTip={showTip}
          canEdit={canEdit && !gridLoading}
          quietEdit={!editPulse}
          focus={focus}
          limits={limits}
          capacity={capacity}
          grids={shownGrids}
          hourLoad={hourLoad}
          onGridChange={onGridChange}
          skin={skin}
          busy={busyMap}
        />
        {gridLoading ? (
          <div className="v2-sched-load">
            <div className="v2-sched-load-card">
              <span className="v2-sched-spin" aria-hidden />
              <b>{t("schedule.loading")}</b>
              <p>{t("schedule.loadingHint")}</p>
            </div>
          </div>
        ) : null}
        </div>
        <section className="v2-muted flex h-9 shrink-0 items-center gap-5 px-4 text-[11px]">
          <div className="flex items-center gap-3">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: selfMark.bg }} />
              Моя метка
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "#A78BFA" }} />
              Игрок
            </span>
            <span>
              <i className="v2-lock-swatch mr-1 inline-block h-2 w-5 rounded-sm" />
              Уровень закрыт
            </span>
            <span className="inline-flex items-center">
              <i className="mr-1.5 inline-block h-3 w-1 rounded-sm" style={{ background: "#ff2d2d", boxShadow: "0 0 8px rgba(255, 45, 45, 0.85)" }} />
              Сейчас
            </span>
            {isKit && canEdit ? (
              <span>
                <i
                  className="mr-1 inline-block h-2 w-3 rounded-sm"
                  style={{ background: "color-mix(in srgb, var(--now, #e11d2e) 35%, var(--muted))", boxShadow: "inset 0 0 0 1px var(--now, #e11d2e)" }}
                />
                {t("v2.tip.busyLegend")}
              </span>
            ) : null}
          </div>
          <p className="ml-auto">{t("v2.skin.optHint")}</p>
        </section>
        {showMine && (
          <V2MyCalendar
            year={year}
            monthIndex={monthIndex}
            title={monthTitle(year, monthIndex, i18n.language)}
            tag={selfMark.t}
            grids={gridsForCalendar(shownGrids, year, monthIndex)}
            today={cetTick.year === year && cetTick.monthIndex === monthIndex ? cetTick.day : null}
            onClose={() => setShowMine(false)}
          />
        )}
        {showSettings && (
          <V2Settings
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTables={!hideTables}
            showTip={showTip}
            editPulse={editPulse}
            showLocalTime={showExtraTz}
            onDimPast={setDimPast}
            onHidePastDays={setHidePastDays}
            onShowTables={(value) => setHideTables(!value)}
            onShowTip={setShowTip}
            onEditPulse={(value) => {
              setEditPulse(value);
              savePrefs({ ...loadPrefs(), editPulse: value });
            }}
            onShowLocalTime={(value) => {
              setShowExtraTz(value);
              savePrefs({ ...loadPrefs(), showExtraTz: value });
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
        {isKit && markOpen && planMatrix ? (
          <MarkPlanDock
            me={me}
            tables={tablesDraft}
            matrix={planMatrix}
            x={markPos.x}
            y={markPos.y}
            onMove={(x, y) => setMarkPos({ x, y })}
            onBump={bumpTables}
            onDraft={(value) => {
              setTablesDraft(value);
              if (!value.trim()) return;
              const n = Number(value);
              if (Number.isFinite(n)) applyTables(n);
            }}
            canActAs={canActAs}
            players={players}
            selfId={selfId}
            actingId={actingId || selfId}
            onActAs={applyActAs}
          />
        ) : null}
        {showAnalytics && (
          <V2Float
            title={t("schedule.analyticsTitle")}
            x={analyticsPos.x}
            y={analyticsPos.y}
            z={front === "fill" ? 50 : 40}
            onMove={(x, y) => setAnalyticsPos({ x, y })}
            onFocus={() => setFront("fill")}
            onClose={() => setShowAnalytics(false)}
          >
            <div className="space-y-4">
              {[
                { label: t("schedule.fillAll"), pct: fill.pct, a: fill.taken, b: fill.seats },
                { label: t("schedule.fillLeft"), pct: fill.futurePct, a: fill.futureTaken, b: fill.futureSeats },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span>{row.label}</span>
                    <span className="v2-mono v2-accent">{pctLabel(row.pct)}</span>
                  </div>
                  <div className="v2-fill h-1.5 overflow-hidden rounded-full">
                    <div className="v2-fill-bar h-full" style={{ width: pctLabel(row.pct) }} />
                  </div>
                  <div className="v2-muted mt-1 v2-mono text-[11px]">
                    {row.a} / {row.b}
                  </div>
                </div>
              ))}
            </div>
          </V2Float>
        )}
        {showPeople && (
          <V2Float
            title={t("schedule.playersTitle")}
            x={peoplePos.x}
            y={peoplePos.y}
            width={Math.min(580, 252 + Math.max(1, limits.length) * 58)}
            compact
            z={front === "people" ? 50 : 40}
            onMove={(x, y) => setPeoplePos({ x, y })}
            onFocus={() => setFront("people")}
            onClose={() => setShowPeople(false)}
          >
            {roster.length ? (
              <table className="v2-people-table">
                <thead>
                  <tr>
                    <th title={t("schedule.colRankHint")}>{t("schedule.colRank")}</th>
                    <th>{t("schedule.colPlayer")}</th>
                    <th>{t("schedule.colMark")}</th>
                    {limits.map((limit) => (
                      <th key={limit} title={t("schedule.limitColHint", { limit: formatLimit(limit) })}>
                        {limit}
                      </th>
                    ))}
                    <th className="v2-people-tick-h" title={t("schedule.donePlanHint")} aria-label={t("schedule.colDone")}>
                      <i className="fa-solid fa-check" aria-hidden />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row) => {
                    const guild = showNick(row.mark.discord) || "—";
                    const room = showNick(row.mark.room);
                    const vip = vipOf(row.mark, kind);
                    return (
                      <tr
                        key={row.mark.memberId || markKey(row.mark)}
                        className={`v2-people-row${vip ? " is-vip" : ""}`}
                        title={vip ? t("cabinet.vipLabel") : undefined}
                        tabIndex={0}
                        onClick={() => setPeek(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setPeek(row);
                          }
                        }}
                      >
                        <td className={`v2-people-rank${vip ? " is-vip" : ""}`}>
                          <b>{row.n}</b>
                        </td>
                        <td>
                          <span className="v2-people-who">
                            <PersonAvatar src={row.mark.avatarUrl} label={rowInitials(guild, row.mark.t)} size="sm" />
                            <span className="v2-people-nicks">
                              <b>
                                {guild}
                                {room ? <i> ({room})</i> : null}
                              </b>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="v2-people-mark" style={{ background: row.mark.bg, color: row.mark.fg }}>
                            {markLabel(row.mark.t)}
                          </span>
                        </td>
                        {limits.map((limit) => {
                          const stat = row.byLimit[limit];
                          return (
                            <td key={limit} className="v2-people-stat">
                              {stat ? (
                                <span className="v2-people-lim">
                                  <b>{stat.slots}</b>
                                  <small>{t("schedule.hoursShort", { n: stat.hours })}</small>
                                </span>
                              ) : (
                                <span className="v2-people-lim is-empty">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="v2-people-tick-cell">
                          <button
                            type="button"
                            className="v2-people-tick"
                            disabled
                            title={t("schedule.donePlanHint")}
                            aria-label={t("schedule.colDone")}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <i className="fa-solid fa-check" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="v2-people-empty">{t("schedule.playersEmpty")}</p>
            )}
          </V2Float>
        )}
        {peek ? (
          <V2UserCard
            row={peek}
            givenName={peek.mark.memberId ? publicNames.get(peek.mark.memberId) : undefined}
            monthLabel={monthTitle(year, monthIndex, i18n.language)}
            onClose={() => setPeek(null)}
          />
        ) : null}
      </div>
    </main>
  );
}
