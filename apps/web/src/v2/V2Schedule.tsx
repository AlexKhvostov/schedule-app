import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatLimit, type CapacityMap } from "../schedule/capacity";
import { ME, markKey, vipOf, type Mark } from "../schedule/marks";
import { emptyMonth, type Occupancy } from "../schedule/plan";
import { monthShort, monthTitle } from "../schedule/formatDate";
import { readCet } from "../schedule/cet";
import { demoMonthPlan } from "../schedule/demoPlan";
import { loadDemoSchedule, resetDemoSchedules, saveDemoSchedule } from "../schedule/demoScheduleStore";
import { rosterFromGrids, formatHours, type RosterRow } from "../schedule/roster";
import { fieldFill, columnFill } from "../schedule/analytics";
import { OptField, type OverwriteAsk } from "./OptField";
import { FillByHourChart } from "./FillByHourChart";
import { V2Float } from "./V2Float";
import { V2MyCalendar } from "./V2MyCalendar";
import { V2Settings } from "./V2Settings";
import { V2UserCard } from "./V2UserCard";
import { OverwriteConfirm } from "./OverwriteConfirm";
import { ScheduleSlot } from "./ScheduleSlot";
import { PersonAvatar } from "./PersonAvatar";
import { BarMark, HoursPanel } from "./SchedulePanels";
import { showV2Toast } from "./V2Toast";
import { gridsWithMySlots, limitsWithMyMarks, mergeOccupiedLimits, myHoursMatrix, occupiedFromSlots } from "./myShifts";
import { type HourLoadMap } from "../schedule/hourLoad";
import { loadPrefs, savePrefs } from "./prefs";
import { centerPos, useWindowPos } from "./windowPos";
import { isLiveData } from "../data/config";
import { loadLiveMember } from "../data/auth";
import { saveMemberTables, loadPublicNames } from "../data/people";
import { listLimitMarks, listSchedulePlayers, markFromPlayer, type SchedulePlayer } from "../data/players";
import { loadMyPlays } from "../data/plays";
import { accessKey, loadScheduleAccess } from "../data/scheduleAccess";
import { applyOwnSlots, loadMemberOccupiedSlots, loadMonthGrids, removeForeignSlots, subscribeOccupancy, ymRange } from "../data/slots";
import { loadScheduleSettings, subscribeScheduleSettings } from "../data/scheduleSettings";
import { notifyMarkRemoved } from "../data/notifyMark";
import { loadMembers, memberOfSession, saveMembers, winamaxPlayLimits } from "../schedule/members";
import { readSession } from "./session";
import { decorateDemoRoster, rowInitials, seatDiffs, showNick, type SeatDiff } from "./schedulePresentation";

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
  const [editByButton, setEditByButton] = useState(true);
  const [editPulse, setEditPulse] = useState(boot.editPulse);
  const [busyHint, setBusyHint] = useState(boot.busyHint);
  const [busyRemote, setBusyRemote] = useState<(string[] | null)[][] | undefined>();
  const [mineRemote, setMineRemote] = useState<(string[] | null)[][] | undefined>();
  const [showExtraTz, setShowExtraTz] = useState(boot.showExtraTz !== false);
  const [tablesDraft, setTablesDraft] = useState("11");
  const [limits, setLimits] = useState<string[]>(boot.limits);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [kind, setKind] = useState(boot.kind);
  const [kindOpen, setKindOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [pickYear, setPickYear] = useState(year);
  const [focus, setFocus] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [peek, setPeek] = useState<RosterRow | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [allowActAs, setAllowActAs] = useState(false);
  const [countTables, setCountTables] = useState(false);
  const [overwriteAsk, setOverwriteAsk] = useState<OverwriteAsk | null>(null);
  const [overwriteBusy, setOverwriteBusy] = useState(false);
  const [limitMarks, setLimitMarks] = useState<Mark[] | null>(null);
  const [publicNames, setPublicNames] = useState<Map<string, string>>(() => new Map());
  const [analyticsPos, setAnalyticsPos] = useWindowPos("analytics", () => centerPos(560, 360));
  const [peoplePos, setPeoplePos] = useWindowPos("people", () => centerPos(420, 360));
  const [hoursPos, setHoursPos] = useWindowPos("hours", () => centerPos(312, 340));
  const [calPos, setCalPos] = useWindowPos("calendar", () => centerPos(640, 480));
  const [settingsPos, setSettingsPos] = useWindowPos("settings", () => centerPos(300, 360));
  const [userPos, setUserPos] = useWindowPos("user-card", () => centerPos(360, 320));
  const [front, setFront] = useState<"fill" | "people" | "hours" | "calendar" | "settings" | "user">("fill");
  const [cetTick, setCetTick] = useState(() => readCet());
  const limitsRef = useRef<HTMLDivElement>(null);
  const kindRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const loadGen = useRef(0);
  const gridsRef = useRef(grids);
  const inflight = useRef(0);
  const busyGen = useRef(0);
  const quietUntil = useRef(0);
  const refreshTimer = useRef(0);
  const liveDebounce = useRef(0);
  const dirtyLive = useRef(false);
  const tablesSaveTimer = useRef(0);
  gridsRef.current = grids;
  const sessionNick = readSession()?.nick ?? "";
  const selfId = memberId ?? memberOfSession(loadMembers(), { memberId, nick: sessionNick })?.id;
  actingRef.current = actingId || selfId;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const [playLimits, setPlayLimits] = useState<string[]>(() =>
    winamaxPlayLimits({ memberId: actingRef.current, nick: sessionNick }),
  );
  const paintOn = !editByButton || canEdit;
  const mayActAs = canActAs || allowActAs;
  const canRemoveForeign = canActAs || allowOverwrite;
  const editGlow = editByButton && canEdit;
  const showBusy = isKit && busyHint;
  const fetchKey = limits.join("|");
  const loadStamp = `${year}-${monthIndex}-${kind}-${fetchKey}`;
  const viewStamp = `${year}-${monthIndex}-${kind}`;
  const gridLoading = isLiveData() && readyStamp !== loadStamp;
  const shownGrids = useMemo(() => {
    if (!gridLoading) return grids;
    if (readyStamp.startsWith(`${viewStamp}-`)) return grids;
    return Object.fromEntries(limits.map((limit) => [limit, emptyMonth(year, monthIndex)]));
  }, [gridLoading, grids, limits, year, monthIndex, readyStamp, viewStamp]);

  const pullGrids = useCallback(
    (stamp: string) => {
      const gen = loadGen.current;
      return loadMonthGrids(year, monthIndex, kind, limits).then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        if (!next) {
          setReadyStamp(stamp);
          return;
        }
        if (next.error) {
          showV2Toast("err", t("schedule.toastLoadError"));
          setReadyStamp(stamp);
          return;
        }
        setGrids(next.grids);
        setReadyStamp(stamp);
      });
    },
    [year, monthIndex, kind, limits, t],
  );

  useEffect(() => {
    setPlayLimits(winamaxPlayLimits({ memberId: actingId || selfId, nick: me.discord || sessionNick }));
  }, [actingId, selfId, me.discord, sessionNick, canEdit]);

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
    const blank = Object.fromEntries(limits.map((limit) => [limit, emptyMonth(year, monthIndex)]));
    if (!isLiveData()) {
      setGrids(Object.fromEntries(limits.map((limit) => [
        limit,
        loadDemoSchedule(year, monthIndex, kind, limit, () => demoMonthPlan(year, monthIndex, kind, limit)),
      ])));
      setReadyStamp(loadStamp);
      return;
    }
    const gen = ++loadGen.current;
    void loadMonthGrids(year, monthIndex, kind, limits)
      .then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        if (!next) {
          setGrids(blank);
          setReadyStamp(loadStamp);
          return;
        }
        if (next.error) {
          showV2Toast("err", t("schedule.toastLoadError"));
          setReadyStamp(loadStamp);
          return;
        }
        setGrids(next.grids);
        setReadyStamp(loadStamp);
      })
      .catch(() => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        showV2Toast("err", t("schedule.toastLoadError"));
        setReadyStamp(loadStamp);
      });
  }, [year, monthIndex, kind, fetchKey, t]);

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
            memberId: member.id,
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

  const busyWhoId = actingId || selfId;
  const busyDays = new Date(year, monthIndex + 1, 0).getDate();
  const pullBusy = useCallback(
    (who: string | undefined) => {
      if (!isLiveData()) {
        setBusyRemote(undefined);
        setMineRemote(undefined);
        return Promise.resolve();
      }
      if (!who) return Promise.resolve();
      const gen = ++busyGen.current;
      return loadMemberOccupiedSlots(year, monthIndex, kind, who).then((rows) => {
        if (gen !== busyGen.current) return;
        if (!rows) return;
        const map = occupiedFromSlots(rows, busyDays);
        if (who === actingRef.current) setBusyRemote(map);
        if (who === selfIdRef.current) setMineRemote(map);
      });
    },
    [year, monthIndex, kind, busyDays],
  );

  const refreshBusy = useCallback(() => {
    void pullBusy(actingRef.current);
    if (selfIdRef.current && selfIdRef.current !== actingRef.current) void pullBusy(selfIdRef.current);
  }, [pullBusy]);

  useEffect(() => {
    void pullBusy(selfId);
  }, [selfId, pullBusy]);

  useEffect(() => {
    if (busyWhoId && busyWhoId !== selfId) void pullBusy(busyWhoId);
  }, [busyWhoId, selfId, pullBusy]);

  useEffect(() => {
    if (!isLiveData()) return;
    const { from, to } = ymRange(year, monthIndex);
    const catchUp = (delay: number) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (inflight.current > 0) return;
        if (!dirtyLive.current) return;
        dirtyLive.current = false;
        void pullGrids(loadStamp);
        refreshBusy();
      }, delay);
    };
    return subscribeOccupancy((change) => {
      if (change.slotDate && (change.slotDate < from || change.slotDate > to)) return;
      if (change.memberId && change.memberId === actingRef.current) {
        refreshBusy();
        return;
      }
      dirtyLive.current = true;
      if (inflight.current > 0 || Date.now() < quietUntil.current) {
        catchUp(Math.max(250, quietUntil.current - Date.now()));
        return;
      }
      window.clearTimeout(liveDebounce.current);
      liveDebounce.current = window.setTimeout(() => {
        if (inflight.current > 0 || Date.now() < quietUntil.current) {
          catchUp(Math.max(250, quietUntil.current - Date.now()));
          return;
        }
        dirtyLive.current = false;
        void pullGrids(loadStamp);
        refreshBusy();
      }, 250);
    });
  }, [year, monthIndex, loadStamp, pullGrids, refreshBusy]);

  useEffect(() => {
    let live = true;
    const apply = () => {
      void loadScheduleSettings().then((next) => {
        if (!live) return;
        setAllowOverwrite(next.allowOverwriteMarks);
        setAllowActAs(next.allowActAs);
        setCountTables(next.countTables);
        setEditByButton(next.editByButton);
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
    return () => {
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
      window.clearTimeout(tablesSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showHours && !showAnalytics && !showPeople && !showMine && !showBusy) return;
    setCetTick(readCet());
    const id = window.setInterval(() => setCetTick(readCet()), 15000);
    return () => window.clearInterval(id);
  }, [showHours, showAnalytics, showPeople, showMine, showBusy]);

  useEffect(() => {
    if (!limitsOpen && !kindOpen && !monthOpen && !searchOpen) return;
    const close = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!limitsRef.current?.contains(node)) setLimitsOpen(false);
      if (!kindRef.current?.contains(node)) setKindOpen(false);
      if (!monthRef.current?.contains(node)) setMonthOpen(false);
      if (!searchRef.current?.contains(node)) setSearchOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLimitsOpen(false);
        setKindOpen(false);
        setMonthOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [limitsOpen, kindOpen, monthOpen, searchOpen]);

  useEffect(() => {
    if (editByButton) setCanEdit(false);
  }, [editByButton]);

  useEffect(() => {
    if (!editByButton || canEdit) return;
    setActingId(selfId);
    setMe(selfMarkRef.current);
    setTablesDraft(String(selfMarkRef.current.tables));
  }, [canEdit, selfId, editByButton]);

  useEffect(() => {
    if (mayActAs) return;
    if (!selfId) return;
    setActingId(selfId);
    setMe(selfMarkRef.current);
    setTablesDraft(String(selfMarkRef.current.tables));
  }, [mayActAs, selfId]);

  useEffect(() => {
    void listSchedulePlayers().then(setPlayers);
  }, []);

  useEffect(() => {
    setTablesDraft(String(me.tables));
  }, [me.tables]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
    if (!paintOn && !showPeople && !mayActAs) return;
    let alive = true;
    void listLimitMarks(kind, limits).then((rows) => {
      if (alive) setLimitMarks(rows);
    });
    return () => {
      alive = false;
    };
  }, [kind, limits, paintOn, showPeople, mayActAs]);

  const clubPlayerIds = useMemo(() => new Set(players.map((row) => row.id)), [players]);
  const roster = useMemo(() => {
    if (!showPeople) return [];
    const rawRows = rosterFromGrids(
      limits
        .map((limit) => ({ limit, grid: shownGrids[limit] }))
        .filter((row): row is { limit: string; grid: Occupancy } => Boolean(row.grid)),
      year,
      monthIndex,
      cetTick,
      limitMarks ?? undefined,
      kind,
    );
    const rows = isLiveData() ? rawRows : decorateDemoRoster(rawRows, loadMembers());
    if (!isLiveData() || !clubPlayerIds.size) return rows;
    return rows.filter((row) => !row.mark.memberId || clubPlayerIds.has(row.mark.memberId));
  }, [showPeople, shownGrids, limits, year, monthIndex, cetTick, limitMarks, kind, clubPlayerIds]);

  const peopleIdsKey = useMemo(() => {
    if (!showPeople) return "";
    return [...new Set(roster.map((row) => row.mark.memberId).filter((id): id is string => Boolean(id)))].sort().join(",");
  }, [showPeople, roster]);

  useEffect(() => {
    if (!showPeople) {
      setPeek(null);
      return;
    }
    if (!isLiveData()) return;
    const ids = peopleIdsKey ? peopleIdsKey.split(",") : [];
    let alive = true;
    void loadPublicNames(ids).then((next) => {
      if (alive) setPublicNames(next);
    });
    return () => {
      alive = false;
    };
  }, [showPeople, peopleIdsKey]);
  const fillByLimit = useMemo(
    () => {
      if (!showAnalytics) return [];
      return limits.flatMap((limit) => {
        const grid = shownGrids[limit];
        if (!grid) return [];
        return [
          {
            limit,
            fill: fieldFill(grid, year, monthIndex, cetTick, limit, undefined, capacity),
            cols: columnFill(shownGrids, [limit], capacity, year, monthIndex),
          },
        ];
      });
    },
    [showAnalytics, shownGrids, limits, year, monthIndex, cetTick, capacity],
  );
  const mineGrids = useMemo(
    () => gridsWithMySlots(shownGrids, mineRemote, selfMark, year, monthIndex),
    [shownGrids, mineRemote, selfMark, year, monthIndex],
  );
  const hoursGrids = useMemo(
    () => gridsWithMySlots(shownGrids, busyRemote, me, year, monthIndex),
    [shownGrids, busyRemote, me, year, monthIndex],
  );
  const dockLimits = useMemo(() => {
    const marked = limitsWithMyMarks(hoursGrids, me);
    const source = playLimits.length ? playLimits : marked.length ? marked : limits;
    const set = new Set([...source, ...marked]);
    return LIMIT_OPTIONS.filter((limit) => set.has(limit));
  }, [playLimits, hoursGrids, me, limits]);
  const hoursMatrix = useMemo(
    () => (showHours ? myHoursMatrix(hoursGrids, me, dockLimits, { year, monthIndex, cet: cetTick }) : null),
    [showHours, hoursGrids, me, dockLimits, year, monthIndex, cetTick],
  );
  const actPlayers = useMemo(() => {
    const known = new Map(players.map((row) => [row.id, row]));
    const seen = new Set<string>();
    const rows: SchedulePlayer[] = [];
    for (const mark of limitMarks ?? []) {
      const id = mark.memberId;
      if (!id || !mark.t.trim() || seen.has(id)) continue;
      seen.add(id);
      const extra = known.get(id);
      rows.push({
        id,
        nick: extra?.nick || mark.discord,
        publicCode: extra?.publicCode || mark.room,
        roomNick: extra?.roomNick || mark.room,
        markTag: mark.t,
        markBg: mark.bg,
        markFg: mark.fg,
        tables: extra?.tables || mark.tables,
        avatarUrl: extra?.avatarUrl || mark.avatarUrl,
        username: extra?.username || mark.username,
        globalName: extra?.globalName || mark.globalName,
        guildNick: extra?.guildNick || mark.guildNick,
      });
    }
    return rows.sort((a, b) => a.nick.localeCompare(b.nick, undefined, { sensitivity: "base" }));
  }, [limitMarks, players]);
  const busyMap = useMemo(
    () => (showBusy ? mergeOccupiedLimits(busyRemote, grids, me, { year, monthIndex, cet: cetTick }) : undefined),
    [showBusy, busyRemote, grids, me, year, monthIndex, cetTick],
  );

  const applyActAs = (id: string) => {
    if (selfId && id === selfId) {
      setActingId(selfId);
      setMe(selfMarkRef.current);
      setTablesDraft(String(selfMarkRef.current.tables));
      return;
    }
    const row = players.find((item) => item.id === id);
    if (row) {
      const mark = markFromPlayer(row);
      setActingId(row.id);
      setMe(mark);
      setTablesDraft(String(mark.tables));
      return;
    }
    const mark = (limitMarks ?? []).find((item) => item.memberId === id);
    if (!mark?.memberId) return;
    setActingId(mark.memberId);
    setMe(mark);
    setTablesDraft(String(mark.tables));
  };

  const writeDiffs = useCallback(
    async (limit: string, diffs: SeatDiff[]) => {
      const selfWrite = selfIdRef.current;
      const brushWrite = actingRef.current;
      const place = diffs.filter((diff) => diff.placed).map((diff) => ({
        day: diff.day,
        half: diff.half,
        level: diff.level,
        tables: diff.tables,
      }));
      const remove = diffs.filter((diff) => !diff.placed).map((diff) => ({
        day: diff.day,
        half: diff.half,
        level: diff.level,
      }));
      if (remove.length && selfWrite) {
        const { error } = await applyOwnSlots({
          memberId: selfWrite,
          limit,
          variant: kind,
          year,
          monthIndex,
          place: [],
          remove,
        });
        if (error) return error;
      }
      if (place.length && brushWrite) {
        const { error } = await applyOwnSlots({
          memberId: brushWrite,
          limit,
          variant: kind,
          year,
          monthIndex,
          place,
          remove: [],
        });
        if (error) return error;
      }
      return undefined;
    },
    [kind, year, monthIndex],
  );

  const onGridChange = useCallback(
    (limit: string, next: Occupancy) => {
      const prevGrid = gridsRef.current[limit] ?? [];
      const diffs = seatDiffs(prevGrid, next);
      setGrids((prev) => ({ ...prev, [limit]: next }));
      if (!isLiveData()) saveDemoSchedule(year, monthIndex, kind, limit, next);
      if (!diffs.length) return;
      if (isLiveData() && diffs.some((diff) => diff.placed) && !accessRef.current.has(accessKey(kind, limit))) {
        setGrids((prev) => ({ ...prev, [limit]: prevGrid }));
        showV2Toast("err", t("schedule.toastNoAccess"));
        return;
      }
      showV2Toast(diffs[0].placed ? "ok" : "off", t(diffs[0].placed ? "schedule.toastPlaced" : "schedule.toastRemoved"));
      if (!isLiveData() || (!selfIdRef.current && !actingRef.current)) return;
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
      loadGen.current += 1;
      quietUntil.current = Date.now() + 800;
      inflight.current += 1;
      void writeDiffs(limit, diffs)
        .then((error) => {
          inflight.current = Math.max(0, inflight.current - 1);
          if (error) {
            setGrids((curr) => ({ ...curr, [limit]: prevGrid }));
            showV2Toast("err", error.includes("no schedule access") ? t("schedule.toastNoAccess") : t("schedule.toastSaveError"));
            return;
          }
          refreshBusy();
        })
        .catch(() => {
          inflight.current = Math.max(0, inflight.current - 1);
          setGrids((curr) => ({ ...curr, [limit]: prevGrid }));
          showV2Toast("err", t("schedule.toastSaveError"));
        });
    },
    [kind, t, writeDiffs, refreshBusy],
  );

  const confirmOverwrite = (action: "wipe" | "empty" = "wipe") => {
    const ask = overwriteAsk;
    if (!ask || overwriteBusy) return;
    const chosen = action === "empty" ? (ask.empty ?? ask.next) : ask.next;
    const pingOwners = () => {
      void notifyMarkRemoved(i18n.language);
    };
    const toastKey =
      action === "empty"
        ? ask.kind === "place"
          ? "schedule.toastPlaced"
          : "schedule.toastRemoved"
        : ask.kind === "place"
          ? "schedule.toastReplaced"
          : "schedule.toastRemoved";
    if (!isLiveData()) {
      setGrids((prev) => ({ ...prev, [ask.limit]: chosen }));
      saveDemoSchedule(year, monthIndex, kind, ask.limit, chosen);
      setOverwriteAsk(null);
      showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
      return;
    }
    if (ask.kind === "place" && !accessRef.current.has(accessKey(kind, ask.limit))) {
      showV2Toast("err", t("schedule.toastNoAccess"));
      setOverwriteAsk(null);
      return;
    }
    setOverwriteBusy(true);
    const prevGrid = gridsRef.current[ask.limit] ?? [];
    const diffs = seatDiffs(prevGrid, chosen);
    void (async () => {
      if (action === "wipe" && ask.slots.length) {
        const { error } = await removeForeignSlots({
          limit: ask.limit,
          variant: kind,
          slots: ask.slots,
        });
        if (error) return error;
      }
      return writeDiffs(ask.limit, diffs);
    })()
      .then((error) => {
        setOverwriteBusy(false);
        setOverwriteAsk(null);
        if (error) {
          showV2Toast(
            "err",
            error.includes("overwrite-off")
              ? t("schedule.overwrite.off")
              : t("schedule.toastSaveError"),
          );
          return;
        }
        if (action === "wipe") pingOwners();
        showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
        loadGen.current += 1;
        quietUntil.current = Date.now() + 800;
        setGrids((prev) => ({ ...prev, [ask.limit]: chosen }));
        refreshBusy();
      })
      .catch(() => {
        setOverwriteBusy(false);
        setOverwriteAsk(null);
        showV2Toast("err", t("schedule.toastSaveError"));
      });
  };

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

  const toggleEdit = () => {
    setCanEdit((on) => !on);
    setToolsOpen(false);
  };

  const tools = [
    {
      key: "mine",
      icon: "fa-regular fa-calendar",
      title: t("schedule.myCalendar"),
      on: showMine,
      run: () => {
        setShowMine((open) => !open);
        setFront("calendar");
        setToolsOpen(false);
      },
    },
    {
      key: "hours",
      icon: "fa-solid fa-clock",
      title: t("schedule.hours"),
      on: showHours,
      run: () => {
        setShowHours((open) => !open);
        setFront("hours");
        setToolsOpen(false);
      },
    },
    {
      key: "analytics",
      icon: "fa-solid fa-chart-column",
      title: t("schedule.analytics"),
      on: showAnalytics,
      run: () => {
        setShowAnalytics((open) => !open);
        setFront("fill");
        setToolsOpen(false);
      },
    },
    {
      key: "people",
      icon: "fa-solid fa-users",
      title: t("schedule.players"),
      on: showPeople,
      run: () => {
        setShowPeople((open) => !open);
        setFront("people");
        setToolsOpen(false);
      },
    },
    {
      key: "settings",
      icon: "fa-solid fa-gear",
      title: t("schedule.settings"),
      on: showSettings,
      run: () => {
        setShowSettings((open) => !open);
        setFront("settings");
        setToolsOpen(false);
      },
    },
  ];

  const zOf = (id: typeof front) => (front === id ? 56 : 48);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section
        className={`v2-sched-bar flex h-10 shrink-0 items-center border-b${editGlow ? " is-edit" : ""}${editGlow && editPulse ? "" : " is-quiet"}`}
        style={{ borderColor: editGlow ? "transparent" : undefined }}
      >
        <div className="v2-filters">
        <button type="button" className="v2-ctrl w-8 v2-month-shift" onClick={() => shiftMonth(-1)} aria-label="prev">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <div className="relative" ref={monthRef}>
          <button
            type="button"
            className="v2-ctrl v2-month-hit"
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
              setToolsOpen(false);
              setSearchOpen(false);
            }}
          >
            <span className="v2-month-full">{monthTitle(year, monthIndex, i18n.language)}</span>
            <span className="v2-month-short">
              {monthShort(monthIndex, i18n.language)} {year}
            </span>
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
        <button type="button" className="v2-ctrl w-8 v2-month-shift" onClick={() => shiftMonth(1)} aria-label="next">
          <i className="fa-solid fa-chevron-right" />
        </button>
        <div className="v2-field-wide">
        <div className="v2-limit-wrap relative" ref={limitsRef}>
          <button
            type="button"
            className={`v2-ctrl v2-field-hit v2-limit-hit${limits.length > 1 ? " is-many" : ""}`}
            title={limits.join(" · ")}
            onClick={() => {
              setLimitsOpen((open) => !open);
              setKindOpen(false);
              setMonthOpen(false);
            }}
          >
            <span className="v2-field-lab">{t("schedule.limit")}: </span>
            <span className="v2-mono v2-limit-vals">{limits.join("·")}</span>
            <i className="fa-solid fa-angle-down v2-muted" />
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
            className="v2-ctrl v2-field-hit"
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
        </div>
        <form className="v2-mark-find v2-mark-find-wide relative shrink-0" onSubmit={(e) => e.preventDefault()}>
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
        </form>
        <div className="v2-mark-pick" ref={searchRef}>
          <button
            type="button"
            className={`v2-ctrl v2-mark-pick-hit${searchOpen || focus.trim() ? " is-on" : ""}`}
            title={t("v2.search.hint")}
            aria-label={t("v2.search.hint")}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setMonthOpen(false);
              setLimitsOpen(false);
              setKindOpen(false);
              setToolsOpen(false);
            }}
          >
            <span className="v2-mono">{focus.trim() || t("schedule.searchAll")}</span>
            <i className="fa-solid fa-angle-down v2-muted" />
          </button>
          {searchOpen ? (
            <div className="v2-bar-menu">
              <button
                type="button"
                className={!focus.trim() ? "is-on" : ""}
                onClick={() => {
                  setFocus("");
                  setSearchOpen(false);
                }}
              >
                {t("schedule.searchAll")}
              </button>
              {fieldMarks
                .filter((mark) => mark.t)
                .map((mark) => (
                  <button
                    key={markKey(mark)}
                    type="button"
                    className={focus.trim().toLowerCase() === mark.t.toLowerCase() ? "is-on" : ""}
                    onClick={() => {
                      setFocus(mark.t);
                      setSearchOpen(false);
                    }}
                  >
                    <span className="v2-mono">{mark.t}</span>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
        <datalist id="v2-marks">
          {fieldMarks.filter((mark) => mark.t).map((mark) => (
            <option key={markKey(mark)} value={mark.t} />
          ))}
        </datalist>
        </div>
        <BarMark
          me={me}
          tables={tablesDraft}
          onBump={bumpTables}
          onDraft={(value) => {
            setTablesDraft(value);
            if (!value.trim()) return;
            const n = Number(value);
            if (Number.isFinite(n)) applyTables(n);
          }}
          canActAs={mayActAs && paintOn}
          players={actPlayers}
          selfId={selfId}
          actingId={actingId || selfId}
          onActAs={applyActAs}
          countTables={countTables}
          showEdit={editByButton}
          editOn={canEdit}
          onToggleEdit={toggleEdit}
          showBusyToggle={isKit}
          busyOn={busyHint}
          onToggleBusy={() => {
            const next = !busyHint;
            setBusyHint(next);
            savePrefs({ ...loadPrefs(), busyHint: next });
          }}
        />
        <div className="v2-tools" ref={toolsRef}>
          <div className="v2-bar-pack v2-tools-pack">
            {tools.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`v2-ctrl w-8${item.on ? " is-on" : ""}`}
                title={item.title}
                aria-pressed={item.on}
                onClick={item.run}
              >
                <i className={item.icon} />
              </button>
            ))}
          </div>
          <div className="v2-tools-fold">
            <button
              type="button"
              className={`v2-tools-fold-hit${toolsOpen ? " is-on" : ""}`}
              title={t("schedule.tools")}
              aria-label={t("schedule.toolsMenu")}
              aria-expanded={toolsOpen}
              onClick={() => {
                setToolsOpen((open) => !open);
                setMonthOpen(false);
                setLimitsOpen(false);
                setKindOpen(false);
                setSearchOpen(false);
              }}
            >
              <i className="fa-solid fa-ellipsis" />
            </button>
            {toolsOpen ? (
              <div className="v2-tools-fold-menu">
                {tools.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={item.on ? "is-on" : ""}
                    onClick={item.run}
                  >
                    <i className={item.icon} />
                    {item.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={gridLoading}>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <OptField
          year={year}
          monthIndex={monthIndex}
          me={me}
          self={selfMark}
          showTables={countTables && !hideTables}
          countTables={countTables}
          dimPast={dimPast}
          hidePastDays={hidePastDays}
          showTip={showTip}
          canEdit={paintOn && !gridLoading}
          quietEdit={!editGlow || !editPulse}
          focus={focus}
          limits={limits}
          capacity={capacity}
          grids={shownGrids}
          hourLoad={hourLoad}
          onGridChange={onGridChange}
          canRemoveForeign={canRemoveForeign}
          onOverwriteAsk={setOverwriteAsk}
          onForeignKept={() => showV2Toast("off", t("schedule.toastForeignKept"))}
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
        {showMine && (
          <V2MyCalendar
            year={year}
            monthIndex={monthIndex}
            title={monthTitle(year, monthIndex, i18n.language)}
            tag={selfMark.t}
            grids={mineGrids}
            today={cetTick.year === year && cetTick.monthIndex === monthIndex ? cetTick.day : null}
            x={calPos.x}
            y={calPos.y}
            z={zOf("calendar")}
            onMove={setCalPos}
            onFocus={() => setFront("calendar")}
            onClose={() => setShowMine(false)}
          />
        )}
        {showSettings && (
          <V2Settings
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTables={!hideTables}
            countTables={countTables}
            showTip={showTip}
            editPulse={editPulse}
            showLocalTime={showExtraTz}
            x={settingsPos.x}
            y={settingsPos.y}
            z={zOf("settings")}
            onMove={setSettingsPos}
            onFocus={() => setFront("settings")}
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
            onResetDemo={!isLiveData() ? () => {
              resetDemoSchedules();
              setGrids(Object.fromEntries(limits.map((limit) => [
                limit,
                demoMonthPlan(year, monthIndex, kind, limit),
              ])));
              showV2Toast("ok", t("schedule.demoResetDone"));
            } : undefined}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showHours && hoursMatrix ? (
          <HoursPanel
            matrix={hoursMatrix}
            year={year}
            monthIndex={monthIndex}
            x={hoursPos.x}
            y={hoursPos.y}
            z={zOf("hours")}
            onMove={setHoursPos}
            onFocus={() => setFront("hours")}
            onClose={() => setShowHours(false)}
          />
        ) : null}
        {showAnalytics && (
          <V2Float
            title={t("schedule.analyticsTitle")}
            x={analyticsPos.x}
            y={analyticsPos.y}
            width={560}
            compact
            z={zOf("fill")}
            onMove={setAnalyticsPos}
            onFocus={() => setFront("fill")}
            onClose={() => setShowAnalytics(false)}
          >
            <div className="v2-analytics">
              <p className="v2-analytics-lead">{t("schedule.fillByHourHint")}</p>
              {fillByLimit.map((row) => (
                <FillByHourChart key={row.limit} limit={row.limit} cols={row.cols} fill={row.fill} />
              ))}
            </div>
          </V2Float>
        )}
        {showPeople && (
          <V2Float
            title={t("schedule.playersTitle")}
            x={peoplePos.x}
            y={peoplePos.y}
            width={Math.min(640, 240 + Math.max(1, limits.length) * 76)}
            compact
            z={zOf("people")}
            onMove={setPeoplePos}
            onFocus={() => setFront("people")}
            onClose={() => setShowPeople(false)}
          >
            {roster.length ? (
              <table className="v2-people-table">
                <colgroup>
                  <col className="v2-people-col-n" />
                  <col />
                  <col className="v2-people-col-mark" />
                  {limits.map((limit) => (
                    <col key={limit} className="v2-people-col-limit" />
                  ))}
                  <col className="v2-people-col-tick" />
                </colgroup>
                <thead>
                  <tr>
                    <th title={t("schedule.colRankHint")}>{t("schedule.colRank")}</th>
                    <th>{t("schedule.colPlayer")}</th>
                    <th>{t("schedule.colMark")}</th>
                    {limits.map((limit) => (
                      <th
                        key={limit}
                        className="v2-people-limit"
                        title={t("schedule.colHoursHint", { limit: formatLimit(limit) })}
                      >
                        {formatLimit(limit)}, {t("schedule.colHoursUnit")}
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
                        onClick={() => {
                          setPeek(row);
                          setFront("user");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setPeek(row);
                            setFront("user");
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
                          <span className="v2-mark-chip">
                            <ScheduleSlot letters={row.mark.t} bg={row.mark.bg} fg={row.mark.fg} tables={row.mark.tables} showTables={countTables && !hideTables} />
                          </span>
                        </td>
                        {limits.map((limit) => {
                          const stat = row.byLimit[limit];
                          const label = formatLimit(limit);
                          if (!stat) {
                            return (
                              <td
                                key={limit}
                                className="v2-people-num is-empty"
                                title={t("schedule.limitEmptyHint", { limit: label })}
                              >
                                —
                              </td>
                            );
                          }
                          return (
                            <td
                              key={limit}
                              className="v2-people-num"
                              title={t("schedule.colHoursHint", { limit: label })}
                            >
                              {formatHours(stat.hours)}
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
            x={userPos.x}
            y={userPos.y}
            z={zOf("user")}
            onMove={setUserPos}
            onFocus={() => setFront("user")}
            onClose={() => setPeek(null)}
            showTables={countTables && !hideTables}
          />
        ) : null}
        {overwriteAsk
          ? createPortal(
              <OverwriteConfirm
                kind={overwriteAsk.kind}
                people={overwriteAsk.people}
                limitLabel={formatLimit(overwriteAsk.limit)}
                busy={overwriteBusy}
                onCancel={() => {
                  if (overwriteBusy) return;
                  setOverwriteAsk(null);
                }}
                onConfirm={() => confirmOverwrite("wipe")}
                onEmpty={overwriteAsk.empty ? () => confirmOverwrite("empty") : undefined}
              />,
              document.body,
            )
          : null}
      </div>
    </main>
  );
}
