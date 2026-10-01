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
import { deadTimeBreakdownsByMember, deadTimeMemberKey } from "../schedule/deadTimeStats";
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
import { BarMark, HoursPanel, MobileScheduleDock } from "./SchedulePanels";
import { showV2Toast } from "./V2Toast";
import { limitsWithMyMarks, mergeOccupiedLimits, myHoursMatrix, occupiedFromSlots } from "./myShifts";
import { type HourLoadMap } from "../schedule/hourLoad";
import { loadPrefs, resetSchedulePrefs, savePrefs } from "./prefs";
import { centerPos, useWindowPos } from "./windowPos";
import { isLiveData } from "../data/config";
import { loadLiveMember } from "../data/auth";
import { loadPublicNames } from "../data/people";
import { listLimitMarks, listSchedulePlayers, markFromPlayer, type SchedulePlayer } from "../data/players";
import { loadMemberTablePresets, subscribeMemberTablePresets } from "../data/tablePresets";
import { loadMyPlays } from "../data/plays";
import { accessKey, loadScheduleAccess } from "../data/scheduleAccess";
import {
  applyOwnSlots,
  gridsForVariant,
  loadMemberOccupiedSlots,
  loadMultiMonthGrids,
  monthGridKey,
  removeForeignSlots,
  replaceVariantGrids,
  subscribeOccupancy,
  ymRange,
  type MonthGridStore,
} from "../data/slots";
import { loadScheduleSettings, subscribeScheduleSettings, type ScheduleFilterLimits } from "../data/scheduleSettings";
import { loadDeadTimeIntervals, subscribeDeadTimeIntervals, type DeadTimeInterval } from "../data/deadTime";
import { notifyMarkRemoved } from "../data/notifyMark";
import { loadMembers, memberOfSession } from "../schedule/members";
import { readSession } from "./session";
import { decorateDemoRoster, rowInitials, seatDiffs, showNick, type SeatDiff } from "./schedulePresentation";
import { scheduleZoomCanEdit, stepScheduleCellWidth } from "./scheduleZoom";
import { displayScheduleColumn, gridsByVariantLabel, schedulePairRows, variantGridItems } from "./variantSchedule";
import { loadTablePresetSelection, saveTablePresetSelection } from "./tablePresetSelection";

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
  const [gridStore, setGridStore] = useState<MonthGridStore>(() =>
    Object.fromEntries(boot.kinds.flatMap((variant) =>
      boot.limits.map((limit) => [monthGridKey(variant, limit), emptyMonth(year, monthIndex)]),
    )),
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
  const [hideTables, setHideTables] = useState(boot.hideTables);
  const [dimPast, setDimPast] = useState(boot.dimPast);
  const [hidePastDays, setHidePastDays] = useState(boot.hidePastDays);
  const [displayRange, setDisplayRange] = useState(boot.displayRange);
  const [workHours, setWorkHours] = useState(boot.workHours);
  const [showTip, setShowTip] = useState(boot.showTip);
  const [canEdit, setCanEdit] = useState(false);
  const [touchLayout, setTouchLayout] = useState(false);
  const [mobileEditOn, setMobileEditOn] = useState(false);
  const [mobileCellWidth, setMobileCellWidth] = useState(20);
  const [mobileFitWidth, setMobileFitWidth] = useState(6);
  const mobileZoomReady = useRef(false);
  const [editByButton, setEditByButton] = useState(true);
  const [editPulse, setEditPulse] = useState(boot.editPulse);
  const [busyHint, setBusyHint] = useState(boot.busyHint);
  const [busyRemote, setBusyRemote] = useState<(string[] | null)[][] | undefined>();
  const [showExtraTz, setShowExtraTz] = useState(boot.showExtraTz !== false);
  const [tablePresets, setTablePresets] = useState<number[]>([ME.tables]);
  const [tablePresetOwnerId, setTablePresetOwnerId] = useState<string>();
  const [limits, setLimits] = useState<string[]>(boot.limits);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [kinds, setKinds] = useState(boot.kinds);
  const [kind, setKind] = useState(boot.kinds[0]);
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
  const [mergeAdjacentSlots, setMergeAdjacentSlots] = useState(false);
  const [deadTimeIntervals, setDeadTimeIntervals] = useState<DeadTimeInterval[] | null>(null);
  const [filterLimits, setFilterLimits] = useState<ScheduleFilterLimits>({
    nitro: [...LIMIT_OPTIONS],
    regular: [...LIMIT_OPTIONS],
  });
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
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;
  const inflight = useRef(0);
  const busyGen = useRef(0);
  const quietUntil = useRef(0);
  const refreshTimer = useRef(0);
  const liveDebounce = useRef(0);
  const dirtyLive = useRef(false);
  const grids = useMemo(() => {
    const stored = gridsForVariant(gridStore, kind, limits);
    return Object.fromEntries(limits.map((limit) => [
      limit,
      stored[limit] ?? emptyMonth(year, monthIndex),
    ]));
  }, [gridStore, kind, limits, year, monthIndex]);
  const gridStoreRef = useRef(gridStore);
  gridStoreRef.current = gridStore;
  const sessionNick = readSession()?.nick ?? "";
  const selfId = memberId ?? memberOfSession(loadMembers(), { memberId, nick: sessionNick })?.id;
  actingRef.current = actingId || selfId;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const paintOn = touchLayout ? mobileEditOn : !editByButton || canEdit;
  const mayActAs = canActAs || allowActAs;
  const canRemoveForeign = canActAs || allowOverwrite;
  const editGlow = touchLayout ? mobileEditOn : editByButton && canEdit;
  const mobileEditEnabled = scheduleZoomCanEdit(mobileCellWidth);
  const showBusy = isKit && busyHint;
  const requestedLimits = isLiveData() ? [...LIMIT_OPTIONS] : limits;
  const fetchKey = requestedLimits.join("|");
  const kindKey = kinds.join("+");
  const loadStamp = `${year}-${monthIndex}-${kindKey}-${fetchKey}`;
  const viewStamp = `${year}-${monthIndex}-${kindKey}`;
  const gridLoading = isLiveData() && readyStamp !== loadStamp;
  const shownGridStore = useMemo(() => {
    if (!gridLoading || readyStamp.startsWith(`${viewStamp}-`)) return gridStore;
    return Object.fromEntries(kinds.flatMap((variant) => requestedLimits.map((limit) => [
      monthGridKey(variant, limit),
      emptyMonth(year, monthIndex),
    ])));
  }, [gridLoading, readyStamp, viewStamp, gridStore, kinds, fetchKey, year, monthIndex]);
  const pairRows = useMemo(
    () => schedulePairRows(filterLimits, kinds, limits, shownGridStore),
    [filterLimits, kinds, limits, shownGridStore],
  );
  const filterOptionLimits = useMemo(
    () => LIMIT_OPTIONS.filter((limit) => kinds.some((variant) => filterLimits[variant].includes(limit))),
    [filterLimits, kinds],
  );
  const auxiliaryItems = useMemo(
    () => variantGridItems(shownGridStore, kinds, limits, pairRows),
    [shownGridStore, kinds, limits, pairRows],
  );
  const auxiliaryLabels = useMemo(() => auxiliaryItems.map((item) => item.label), [auxiliaryItems]);
  const auxiliaryGrids = useMemo(() => gridsByVariantLabel(auxiliaryItems), [auxiliaryItems]);

  const pullGrids = useCallback(
    (stamp: string) => {
      const gen = loadGen.current;
      return loadMultiMonthGrids(year, monthIndex, kinds, requestedLimits).then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        setGridStore((store) => next.loaded.reduce((result, variant) =>
          replaceVariantGrids(result, variant, gridsForVariant(next.grids, variant, requestedLimits)), store));
        if (Object.keys(next.errors).length) {
          showV2Toast("err", t("schedule.toastLoadError"));
        }
        setReadyStamp(stamp);
      });
    },
    [year, monthIndex, kinds, fetchKey, t],
  );

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
    if (!isLiveData()) {
      setGridStore(Object.fromEntries(kinds.flatMap((variant) => requestedLimits.map((limit) => [
        monthGridKey(variant, limit),
        loadDemoSchedule(year, monthIndex, variant, limit, () => demoMonthPlan(year, monthIndex, variant, limit)),
      ]))));
      setReadyStamp(loadStamp);
      return;
    }
    const gen = ++loadGen.current;
    void loadMultiMonthGrids(year, monthIndex, kinds, requestedLimits)
      .then((next) => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        setGridStore((store) => next.loaded.reduce((result, variant) =>
          replaceVariantGrids(result, variant, gridsForVariant(next.grids, variant, requestedLimits)), store));
        if (Object.keys(next.errors).length) {
          showV2Toast("err", t("schedule.toastLoadError"));
        }
        setReadyStamp(loadStamp);
      })
      .catch(() => {
        if (gen !== loadGen.current) return;
        if (inflight.current > 0) return;
        showV2Toast("err", t("schedule.toastLoadError"));
        setReadyStamp(loadStamp);
      });
  }, [year, monthIndex, kindKey, fetchKey, t]);

  useEffect(() => {
    const applySelf = (mark: Mark, id?: string) => {
      setSelfMark(mark);
      setActingId((current) => {
        if (current && id && current !== id) return current;
        setMe(mark);
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
      avatarUrl: row.avatar,
      username: row.discord,
      globalName: row.discordDisplay,
      guildNick: row.discordGuildNick,
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
        return Promise.resolve();
      }
      if (!who) return Promise.resolve();
      const gen = ++busyGen.current;
      return Promise.all(kinds.map((variant) => loadMemberOccupiedSlots(year, monthIndex, variant, who))).then((groups) => {
        if (gen !== busyGen.current) return;
        if (groups.some((rows) => rows === null)) return;
        const rows = groups.flatMap((group) => group ?? []);
        const map = occupiedFromSlots(rows, busyDays);
        if (who === actingRef.current) setBusyRemote(map);
      });
    },
    [year, monthIndex, kinds, busyDays],
  );

  const refreshBusy = useCallback(() => {
    void pullBusy(actingRef.current);
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
    const query = window.matchMedia("(max-width: 720px), (pointer: coarse) and (hover: none)");
    const sync = () => setTouchLayout(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!touchLayout) {
      setMobileEditOn(false);
      mobileZoomReady.current = false;
      return;
    }
    setCanEdit(false);
  }, [touchLayout]);

  useEffect(() => {
    setMobileEditOn(false);
  }, [year, monthIndex, kind, fetchKey]);

  useEffect(() => {
    let live = true;
    const apply = () => {
      void loadScheduleSettings().then((next) => {
        if (!live) return;
        setAllowOverwrite(next.allowOverwriteMarks);
        setAllowActAs(next.allowActAs);
        setCountTables(next.countTables);
        setMergeAdjacentSlots(next.mergeAdjacentSlots);
        setEditByButton(next.editByButton);
        setFilterLimits(next.filterLimits);
        setLimits((current) => {
          const selectedKinds = kindsRef.current;
          const available = new Set(selectedKinds.flatMap((variant) => next.filterLimits[variant]));
          const normalized = current.filter((limit) => available.has(limit));
          const result = normalized.length ? normalized : [selectedKinds.flatMap((variant) => next.filterLimits[variant])[0] ?? "50"];
          if (result.join("|") !== current.join("|")) savePrefs({ ...loadPrefs(), limits: result });
          return result;
        });
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
      void loadDeadTimeIntervals()
        .then((next) => {
          if (live) setDeadTimeIntervals(next);
        })
        .catch(() => {
          if (!live) return;
          setDeadTimeIntervals(null);
          showV2Toast("err", t("schedule.deadTimeLoadError"));
        });
    };
    apply();
    const off = subscribeDeadTimeIntervals(apply);
    return () => {
      live = false;
      off();
    };
  }, [t]);

  useEffect(() => {
    return () => {
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
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
  }, [canEdit, selfId, editByButton]);

  useEffect(() => {
    if (mayActAs) return;
    if (!selfId) return;
    setActingId(selfId);
    setMe(selfMarkRef.current);
  }, [mayActAs, selfId]);

  useEffect(() => {
    void listSchedulePlayers().then(setPlayers);
  }, []);

  const brushId = actingId || selfId;
  useEffect(() => {
    if (!brushId) return;
    let active = true;
    const player = players.find((row) => row.id === brushId);
    const fallback = brushId === selfId ? selfMarkRef.current.tables : player?.tables ?? 1;
    setTablePresetOwnerId(undefined);
    const apply = (presets: readonly number[]) => {
      if (!active) return;
      const selected = loadTablePresetSelection(brushId, presets, fallback);
      setTablePresets(selected.values);
      setTablePresetOwnerId(brushId);
      setMe((mark) => (mark.memberId && mark.memberId !== brushId ? mark : { ...mark, tables: selected.active }));
      if (brushId === selfId) {
        setSelfMark((mark) => ({ ...mark, tables: selected.active }));
      }
    };
    if (!isLiveData()) {
      const member = loadMembers().find((row) => row.id === brushId);
      apply(member?.tablePresets ?? player?.tablePresets ?? [fallback]);
      return () => {
        active = false;
      };
    }
    const reload = () => {
      void loadMemberTablePresets(brushId, fallback).then((result) => apply(result.presets));
    };
    reload();
    const off = subscribeMemberTablePresets(brushId, reload);
    return () => {
      active = false;
      off();
    };
  }, [brushId, selfId, players]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visibleGrids = useMemo(() => auxiliaryItems.map((item) => item.grid), [auxiliaryItems]);
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
    void Promise.all(kinds.map((variant) => listLimitMarks(variant, limits))).then((groups) => {
      if (!alive) return;
      const seen = new Map<string, Mark>();
      for (const mark of groups.flat()) seen.set(markKey(mark), mark);
      setLimitMarks([...seen.values()]);
    });
    return () => {
      alive = false;
    };
  }, [kinds, limits, paintOn, showPeople, mayActAs]);

  const clubPlayerIds = useMemo(() => new Set(players.map((row) => row.id)), [players]);
  const roster = useMemo(() => {
    if (!showPeople) return [];
    const rawRows = rosterFromGrids(
      auxiliaryItems.map((item) => ({ limit: item.label, grid: item.grid })),
      year,
      monthIndex,
      cetTick,
      limitMarks ?? undefined,
      kind,
    );
    const rows = isLiveData() ? rawRows : decorateDemoRoster(rawRows, loadMembers());
    if (!isLiveData() || !clubPlayerIds.size) return rows;
    return rows.filter((row) => !row.mark.memberId || clubPlayerIds.has(row.mark.memberId));
  }, [showPeople, auxiliaryItems, year, monthIndex, cetTick, limitMarks, kind, clubPlayerIds]);

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
      return auxiliaryItems.map((item) => ({
        key: item.key,
        label: item.label,
        limit: item.limit,
        fill: fieldFill(item.grid, year, monthIndex, cetTick, item.limit, undefined, capacity),
        cols: columnFill({ [item.limit]: item.grid }, [item.limit], capacity, year, monthIndex),
      }));
    },
    [showAnalytics, auxiliaryItems, year, monthIndex, cetTick, capacity],
  );
  const mineGrids = auxiliaryGrids;
  const hoursGrids = auxiliaryGrids;
  const dockLimits = useMemo(() => {
    const marked = limitsWithMyMarks(hoursGrids, me, auxiliaryLabels);
    return marked.length ? marked : auxiliaryLabels;
  }, [hoursGrids, me, auxiliaryLabels]);
  const hoursMatrix = useMemo(
    () => (showHours ? myHoursMatrix(hoursGrids, me, dockLimits, { year, monthIndex, cet: cetTick }) : null),
    [showHours, hoursGrids, me, dockLimits, year, monthIndex, cetTick],
  );
  const deadTimeByMember = useMemo(
    () => deadTimeIntervals ? deadTimeBreakdownsByMember(auxiliaryItems, deadTimeIntervals) : null,
    [auxiliaryItems, deadTimeIntervals],
  );
  const myDeadTime = useMemo(() => {
    if (!deadTimeByMember) return null;
    return deadTimeByMember[deadTimeMemberKey(me)] ?? { byPair: {}, total: 0 };
  }, [deadTimeByMember, me]);
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
        profileName: extra?.profileName,
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
      return;
    }
    const row = players.find((item) => item.id === id);
    if (row) {
      const mark = markFromPlayer(row);
      setActingId(row.id);
      setMe(mark);
      return;
    }
    const mark = (limitMarks ?? []).find((item) => item.memberId === id);
    if (!mark?.memberId) return;
    setActingId(mark.memberId);
    setMe(mark);
  };

  const writeDiffs = useCallback(
    async (variant: "nitro" | "regular", limit: string, diffs: SeatDiff[]) => {
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
          variant,
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
          variant,
          year,
          monthIndex,
          place,
          remove: [],
        });
        if (error) return error;
      }
      return undefined;
    },
    [year, monthIndex],
  );

  const onGridChange = useCallback(
    (variant: "nitro" | "regular", limit: string, next: Occupancy) => {
      const key = monthGridKey(variant, limit);
      const prevGrid = gridStoreRef.current[key] ?? [];
      const diffs = seatDiffs(prevGrid, next);
      setGridStore((store) => ({ ...store, [key]: next }));
      if (!isLiveData()) saveDemoSchedule(year, monthIndex, variant, limit, next);
      if (!diffs.length) return;
      if (isLiveData() && diffs.some((diff) => diff.placed) && !accessRef.current.has(accessKey(variant, limit))) {
        setGridStore((store) => ({ ...store, [key]: prevGrid }));
        showV2Toast("err", t("schedule.toastNoAccess"));
        return;
      }
      if (diffs.some((diff) => diff.placed) && !filterLimits[variant].includes(limit)) {
        setGridStore((store) => ({ ...store, [key]: prevGrid }));
        showV2Toast("err", t("schedule.toastLimitDisabled"));
        return;
      }
      showV2Toast(diffs[0].placed ? "ok" : "off", t(diffs[0].placed ? "schedule.toastPlaced" : "schedule.toastRemoved"));
      if (!isLiveData() || (!selfIdRef.current && !actingRef.current)) return;
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(liveDebounce.current);
      loadGen.current += 1;
      quietUntil.current = Date.now() + 800;
      inflight.current += 1;
      void writeDiffs(variant, limit, diffs)
        .then((error) => {
          inflight.current = Math.max(0, inflight.current - 1);
          if (error) {
            setGridStore((store) => ({ ...store, [key]: prevGrid }));
            showV2Toast("err", error.includes("no schedule access") ? t("schedule.toastNoAccess") : t("schedule.toastSaveError"));
            return;
          }
          refreshBusy();
        })
        .catch(() => {
          inflight.current = Math.max(0, inflight.current - 1);
          setGridStore((store) => ({ ...store, [key]: prevGrid }));
          showV2Toast("err", t("schedule.toastSaveError"));
        });
    },
    [year, monthIndex, t, writeDiffs, refreshBusy, filterLimits],
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
      setGridStore((store) => ({ ...store, [monthGridKey(ask.variant, ask.limit)]: chosen }));
      saveDemoSchedule(year, monthIndex, ask.variant, ask.limit, chosen);
      setOverwriteAsk(null);
      showV2Toast(ask.kind === "place" && action === "empty" ? "ok" : "off", t(toastKey));
      return;
    }
    if (ask.kind === "place" && !accessRef.current.has(accessKey(ask.variant, ask.limit))) {
      showV2Toast("err", t("schedule.toastNoAccess"));
      setOverwriteAsk(null);
      return;
    }
    if (ask.kind === "place" && !filterLimits[ask.variant].includes(ask.limit)) {
      showV2Toast("err", t("schedule.toastLimitDisabled"));
      setOverwriteAsk(null);
      return;
    }
    setOverwriteBusy(true);
    const prevGrid = gridStoreRef.current[monthGridKey(ask.variant, ask.limit)] ?? [];
    const diffs = seatDiffs(prevGrid, chosen);
    void (async () => {
      if (action === "wipe" && ask.slots.length) {
        const { error } = await removeForeignSlots({
          limit: ask.limit,
          variant: ask.variant,
          slots: ask.slots,
        });
        if (error) return error;
      }
      return writeDiffs(ask.variant, ask.limit, diffs);
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
        setGridStore((store) => ({ ...store, [monthGridKey(ask.variant, ask.limit)]: chosen }));
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
      const next = prev.includes(value)
        ? prev.length === 1 ? prev : prev.filter((item) => item !== value)
        : [...prev, value].sort((a, b) => Number(a) - Number(b));
      savePrefs({ ...loadPrefs(), limits: next });
      return next;
    });
    setGridStore((store) => {
      let next = store;
      for (const variant of kinds) {
        const key = monthGridKey(variant, value);
        if (!next[key]) next = { ...next, [key]: emptyMonth(year, monthIndex) };
      }
      return next;
    });
  };

  const toggleKind = (value: "nitro" | "regular") => {
    setKinds((current) => {
      const next = current.includes(value)
        ? current.length === 1 ? current : current.filter((item) => item !== value)
        : (["nitro", "regular"] as const).filter((item) => current.includes(item) || item === value);
      const available = new Set(next.flatMap((variant) => filterLimits[variant]));
      setLimits((currentLimits) => {
        const normalized = currentLimits.filter((limit) => available.has(limit));
        const result = normalized.length ? normalized : [next.flatMap((variant) => filterLimits[variant])[0] ?? "50"];
        savePrefs({ ...loadPrefs(), kinds: next, limits: result });
        return result;
      });
      const primary = next.includes(kind) ? kind : next[0];
      setKind(primary);
      onKindChange?.(primary);
      return next;
    });
  };

  const shiftMonth = (delta: number) => onCursorChange(new Date(year, monthIndex + delta, 1));

  const loadTablePresetsForPlayer = async (memberId: string) => {
    const player = players.find((row) => row.id === memberId);
    const fallback = memberId === selfId ? selfMarkRef.current.tables : player?.tables ?? 1;
    if (!isLiveData()) {
      const member = loadMembers().find((row) => row.id === memberId);
      return loadTablePresetSelection(memberId, member?.tablePresets ?? player?.tablePresets ?? [fallback], fallback);
    }
    try {
      const result = await loadMemberTablePresets(memberId, fallback);
      return loadTablePresetSelection(memberId, result.presets, fallback);
    } catch {
      return loadTablePresetSelection(memberId, [fallback], fallback);
    }
  };

  const selectTablePreset = (value: number, requestedMemberId?: string, presets: readonly number[] = tablePresets) => {
    const targetId = requestedMemberId || actingRef.current;
    if (!targetId || !presets.includes(value)) return;
    const player = players.find((row) => row.id === targetId);
    const base = targetId === selfId ? selfMarkRef.current : player ? markFromPlayer(player) : null;
    if (!base) return;
    actingRef.current = targetId;
    setActingId(targetId);
    saveTablePresetSelection(targetId, value);
    setTablePresets([...presets]);
    setTablePresetOwnerId(targetId);
    setMe({ ...base, tables: value });
    if (selfId && targetId === selfId) {
      setSelfMark((mark) => ({ ...mark, tables: value }));
    }
  };

  const toggleEdit = () => {
    if (touchLayout) {
      if (!mobileEditOn && !mobileEditEnabled) return;
      setMobileEditOn((on) => !on);
      setToolsOpen(false);
      return;
    }
    setCanEdit((on) => !on);
    setToolsOpen(false);
  };

  const updateMobileFitWidth = useCallback((value: number) => {
    setMobileFitWidth(value);
    if (!touchLayout || mobileZoomReady.current) return;
    mobileZoomReady.current = true;
    setMobileCellWidth(value);
  }, [touchLayout]);

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

  const mobileScheduleTools = touchLayout ? (
    <MobileScheduleDock
      me={me}
      tables={me.tables}
      tablePresets={tablePresets}
      tablePresetOwnerId={tablePresetOwnerId}
      onTableSelect={selectTablePreset}
      onLoadTablePresets={loadTablePresetsForPlayer}
      canActAs={mayActAs && mobileEditOn}
      players={actPlayers}
      selfId={selfId}
      actingId={actingId || selfId}
      onActAs={applyActAs}
      countTables={countTables}
      showBusyToggle={isKit}
      busyOn={busyHint}
      onToggleBusy={() => {
        const next = !busyHint;
        setBusyHint(next);
        savePrefs({ ...loadPrefs(), busyHint: next });
      }}
      cellWidth={mobileCellWidth}
      fitWidth={mobileFitWidth}
      editEnabled={mobileEditEnabled}
      editOn={mobileEditOn}
      onZoomOut={() => setMobileCellWidth((value) => stepScheduleCellWidth(value, -1, mobileFitWidth))}
      onFit={() => setMobileCellWidth(mobileFitWidth)}
      onZoomIn={() => setMobileCellWidth((value) => stepScheduleCellWidth(value, 1, mobileFitWidth))}
      onToggleEdit={toggleEdit}
    />
  ) : undefined;

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
              {filterOptionLimits.map((value) => {
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
            {kinds.map((variant) => variant === "nitro" ? "Nitro" : "Regular").join(" · ")}
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
                  className={kinds.includes(value) ? "is-on" : ""}
                  aria-pressed={kinds.includes(value)}
                  onClick={() => {
                    toggleKind(value);
                  }}
                >
                  <i className={`fa-solid ${kinds.includes(value) ? "fa-check-square" : "fa-square"}`} />
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
        {!touchLayout ? <BarMark
          me={me}
          tables={me.tables}
          tablePresets={tablePresets}
          tablePresetOwnerId={tablePresetOwnerId}
          onTableSelect={selectTablePreset}
          onLoadTablePresets={loadTablePresetsForPlayer}
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
        /> : null}
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
          mergeAdjacentSlots={mergeAdjacentSlots}
          dimPast={dimPast}
          hidePastDays={hidePastDays}
          displayRange={displayRange}
          workHours={workHours}
          showTip={showTip}
          canEdit={paintOn && !gridLoading}
          quietEdit={!editGlow || !editPulse}
          focus={focus}
          kinds={kinds}
          limits={limits}
          pairRows={pairRows}
          capacity={capacity}
          grids={shownGridStore}
          players={players}
          hourLoad={hourLoad}
          onGridChange={onGridChange}
          canRemoveForeign={canRemoveForeign}
          onOverwriteAsk={setOverwriteAsk}
          onForeignKept={() => showV2Toast("off", t("schedule.toastForeignKept"))}
          skin={skin}
          busy={busyMap}
          cellWidth={touchLayout ? mobileCellWidth : 20}
          zoomEnabled={touchLayout && !mobileEditOn}
          onCellWidthChange={touchLayout ? setMobileCellWidth : undefined}
          onFitWidthChange={updateMobileFitWidth}
          footerTools={mobileScheduleTools}
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
            columns={auxiliaryItems}
            grids={mineGrids}
            today={cetTick.year === year && cetTick.monthIndex === monthIndex ? cetTick.day : null}
            workHours={workHours}
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
            displayRange={displayRange}
            workHours={workHours}
            showDisplayRange={cetTick.year === year && cetTick.monthIndex === monthIndex}
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
            onDimPast={(value) => {
              setDimPast(value);
              savePrefs({ ...loadPrefs(), dimPast: value });
            }}
            onHidePastDays={(value) => {
              setHidePastDays(value);
              savePrefs({ ...loadPrefs(), hidePastDays: value });
            }}
            onDisplayRange={(value) => {
              setDisplayRange(value);
              savePrefs({ ...loadPrefs(), displayRange: value });
            }}
            onWorkHours={(hours) => {
              setWorkHours(hours);
              savePrefs({ ...loadPrefs(), workHours: hours });
            }}
            onShowTables={(value) => {
              setHideTables(!value);
              savePrefs({ ...loadPrefs(), hideTables: !value });
            }}
            onShowTip={(value) => {
              setShowTip(value);
              savePrefs({ ...loadPrefs(), showTip: value });
            }}
            onEditPulse={(value) => {
              setEditPulse(value);
              savePrefs({ ...loadPrefs(), editPulse: value });
            }}
            onShowLocalTime={(value) => {
              setShowExtraTz(value);
              savePrefs({ ...loadPrefs(), showExtraTz: value });
            }}
            onResetPrefs={() => {
              const next = resetSchedulePrefs();
              setLimits(next.limits);
              setKinds(next.kinds);
              setKind(next.kinds[0]);
              setEditPulse(next.editPulse);
              setShowExtraTz(next.showExtraTz);
              setBusyHint(next.busyHint);
              setDimPast(next.dimPast);
              setHidePastDays(next.hidePastDays);
              setDisplayRange(next.displayRange);
              setWorkHours(next.workHours);
              setHideTables(next.hideTables);
              setShowTip(next.showTip);
              onKindChange?.(next.kinds[0]);
            }}
            onResetDemo={!isLiveData() ? () => {
              resetDemoSchedules();
              setGridStore(Object.fromEntries(kinds.flatMap((variant) => limits.map((limit) => [
                monthGridKey(variant, limit),
                demoMonthPlan(year, monthIndex, variant, limit),
              ]))));
              showV2Toast("ok", t("schedule.demoResetDone"));
            } : undefined}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showHours && hoursMatrix ? (
          <HoursPanel
            matrix={hoursMatrix}
            deadTime={myDeadTime}
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
                <FillByHourChart key={row.key} limit={row.limit} label={row.label} cols={row.cols} fill={row.fill} />
              ))}
            </div>
          </V2Float>
        )}
        {showPeople && (
          <V2Float
            title={t("schedule.playersTitle")}
            x={peoplePos.x}
            y={peoplePos.y}
            width={Math.min(880, 310 + Math.max(1, auxiliaryLabels.length) * 88)}
            compact
            z={zOf("people")}
            onMove={setPeoplePos}
            onFocus={() => setFront("people")}
            onClose={() => setShowPeople(false)}
          >
            {roster.length ? (
              <table
                className="v2-people-table"
                style={{ minWidth: 240 + auxiliaryLabels.length * 84 }}
              >
                <colgroup>
                  <col className="v2-people-col-n" />
                  <col />
                  <col className="v2-people-col-mark" />
                  {auxiliaryLabels.map((limit) => (
                    <col key={limit} className="v2-people-col-limit" />
                  ))}
                  <col className="v2-people-col-dead" />
                  <col className="v2-people-col-tick" />
                </colgroup>
                <thead>
                  <tr>
                    <th title={t("schedule.colRankHint")}>{t("schedule.colRank")}</th>
                    <th>{t("schedule.colPlayer")}</th>
                    <th>{t("schedule.colMark")}</th>
                    {auxiliaryLabels.map((limit) => (
                      <th
                        key={limit}
                        className="v2-people-limit"
                        title={t("schedule.colHoursHint", { limit: displayScheduleColumn(limit) })}
                      >
                        <span>{displayScheduleColumn(limit)}</span>
                        <small>{t("schedule.colHoursDeadUnits")}</small>
                      </th>
                    ))}
                    <th className="v2-people-dead-total" title={t("schedule.deadTotalHint")}>
                      <span>{t("schedule.deadTotal")}</span>
                      <small>{t("schedule.colHoursUnit")}</small>
                    </th>
                    <th className="v2-people-tick-h" title={t("schedule.donePlanHint")} aria-label={t("schedule.colDone")}>
                      <i className="fa-solid fa-check" aria-hidden />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row) => {
                    const memberDeadTime = deadTimeByMember?.[deadTimeMemberKey(row.mark)];
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
                        {auxiliaryLabels.map((limit) => {
                          const stat = row.byLimit[limit];
                          const deadHours = memberDeadTime?.byPair[limit] || 0;
                          const label = displayScheduleColumn(limit);
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
                              <b>{formatHours(stat.hours)}</b>
                              <small>{t("schedule.deadHoursShort")} {deadTimeByMember && deadHours ? formatHours(deadHours) : "—"}</small>
                            </td>
                          );
                        })}
                        <td
                          className={`v2-people-num v2-people-dead-total${memberDeadTime?.total ? " is-on" : ""}`}
                          title={t("schedule.deadTotalHint")}
                        >
                          {deadTimeByMember && memberDeadTime?.total ? formatHours(memberDeadTime.total) : "—"}
                        </td>
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
