import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { isLiveData } from "../data/config";
import { loadPublicNames } from "../data/people";
import { listLimitMarks } from "../data/players";
import {
  monthGridKey
} from "../data/slots";
import { columnFill, fieldFill } from "../schedule/analytics";
import { LIMIT_OPTIONS, formatLimit, type CapacityMap } from "../schedule/capacity";
import { readCet } from "../schedule/cet";
import { deadTimeBreakdownsByMember, deadTimeMemberKey } from "../schedule/deadTimeStats";
import { demoMonthPlan } from "../schedule/demoPlan";
import { resetDemoSchedules } from "../schedule/demoScheduleStore";
import { monthTitle } from "../schedule/formatDate";
import { type HourLoadMap } from "../schedule/hourLoad";
import { markKey, type Mark } from "../schedule/marks";
import { loadMembers } from "../schedule/members";
import { emptyMonth } from "../schedule/plan";
import { groupRosterRows, rosterFromGrids, type RosterRow } from "../schedule/roster";
import { FillByHourChart } from "./FillByHourChart";
import { OptField } from "./OptField";
import { OverwriteConfirm } from "./OverwriteConfirm";
import { HoursPanel, MobileScheduleDock } from "./SchedulePanels";
import { V2Float } from "./V2Float";
import { V2MyCalendar } from "./V2MyCalendar";
import { showV2Toast } from "./V2Toast";
import { V2UserCard } from "./V2UserCard";
import {
  limitsWithMyMarks,
  mergeOccupiedPairs,
  myHoursMatrix
} from "./myShifts";
import { loadPrefs, savePrefs } from "./prefs";
import { ScheduleRoster } from "./schedule/ScheduleRoster";
import { ScheduleToolbar } from "./schedule/ScheduleToolbar";
import { ScheduleViewSettings } from "./schedule/ScheduleViewSettings";
import { CALENDAR_VARIANTS } from "./schedule/constants";
import { useScheduleBrush } from "./schedule/useScheduleBrush";
import { useScheduleMonth } from "./schedule/useScheduleMonth";
import { useScheduleMutations } from "./schedule/useScheduleMutations";
import { useSchedulePreferences } from "./schedule/useSchedulePreferences";
import { useScheduleRules } from "./schedule/useScheduleRules";
import { useScheduleToolbar } from "./schedule/useScheduleToolbar";
import { decorateDemoRoster } from "./schedulePresentation";
import { scheduleZoomCanEdit, stepScheduleCellWidth } from "./scheduleZoom";
import { gridsByVariantLabel, schedulePairRows, variantGridItems } from "./variantSchedule";
import { centerPos, useWindowPos } from "./windowPos";

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
  const preferences = useSchedulePreferences(onKindChange);
  const { hideTables, dimPast, hidePastDays, displayRange, workHours, showTip, editPulse, busyHint, setBusyHint, limits, setLimits, kinds, setKinds, kind, setKind, kindsRef } = preferences;
  const toolbar = useScheduleToolbar(year);
  const { focus, setToolsOpen } = toolbar;
  const [showMine, setShowMine] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [touchLayout, setTouchLayout] = useState(false);
  const [mobileEditOn, setMobileEditOn] = useState(false);
  const [mobileCellWidth, setMobileCellWidth] = useState(20);
  const [mobileFitWidth, setMobileFitWidth] = useState(6);
  const mobileZoomReady = useRef(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [peek, setPeek] = useState<RosterRow | null>(null);
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
  const { editByButton, allowOverwrite, allowActAs, countTables, mergeAdjacentSlots, deadTimeIntervals, filterLimits } = useScheduleRules({ kindsRef, setLimits, t });
  const brush = useScheduleBrush({
    memberId, mayActAs: canActAs || allowActAs, editByButton, canEdit, limitMarks,
  });
  const { selfMark, me, actingId, actingRef, selfId, selfIdRef, accessRef, selectedPlayPairsRef, players, tablePresets, tablePresetOwnerId, actPlayers, applyActAs, loadTablePresetsForPlayer, selectTablePreset } = brush;
  const month = useScheduleMonth({ year, monthIndex, selfId, actingId, actingRef, t });
  const { setGridStore, busyRemote, requestedLimits, fetchKey, gridLoading, shownGridStore } = month;

  const { overwriteAsk, setOverwriteAsk, overwriteBusy, missingPlayPair, setMissingPlayPair, onGridChange, confirmOverwrite } = useScheduleMutations({
    year, monthIndex, month, selfIdRef, actingRef, accessRef, selectedPlayPairsRef, filterLimits, t, language: i18n.language,
  });
  const paintOn = touchLayout ? mobileEditOn : !editByButton || canEdit;
  const mayActAs = canActAs || allowActAs;
  const canRemoveForeign = canActAs || allowOverwrite;
  const editGlow = touchLayout ? mobileEditOn : editByButton && canEdit;
  const mobileEditEnabled = scheduleZoomCanEdit(mobileCellWidth);
  const showBusy = isKit && busyHint;
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
  const calendarItems = useMemo(
    () => variantGridItems(shownGridStore, [...CALENDAR_VARIANTS], requestedLimits),
    [shownGridStore, fetchKey],
  );
  const calendarGrids = useMemo(() => gridsByVariantLabel(calendarItems), [calendarItems]);

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
    if (!showHours && !showAnalytics && !showPeople && !showMine && !showBusy) return;
    setCetTick(readCet());
    const id = window.setInterval(() => setCetTick(readCet()), 15000);
    return () => window.clearInterval(id);
  }, [showHours, showAnalytics, showPeople, showMine, showBusy]);

  useEffect(() => {
    if (editByButton) setCanEdit(false);
  }, [editByButton]);

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

  const eligiblePlayerIds = useMemo(
    () => new Set((limitMarks ?? []).map((mark) => mark.memberId).filter((id): id is string => Boolean(id))),
    [limitMarks],
  );
  const rosterGroups = useMemo(() => {
    if (!showPeople || limitMarks === null) return { active: [], historical: [] };
    const items = auxiliaryItems.map((item) => ({ limit: item.label, grid: item.grid }));
    const occupiedRows = rosterFromGrids(items, year, monthIndex, cetTick, undefined, kind);
    const activeRows = rosterFromGrids(items, year, monthIndex, cetTick, limitMarks, kind);
    const occupied = isLiveData() ? occupiedRows : decorateDemoRoster(occupiedRows, loadMembers());
    const active = isLiveData() ? activeRows : decorateDemoRoster(activeRows, loadMembers());
    return groupRosterRows(active, occupied, eligiblePlayerIds);
  }, [showPeople, auxiliaryItems, year, monthIndex, cetTick, limitMarks, kind, eligiblePlayerIds]);
  const roster = rosterGroups.active;
  const historicalRoster = rosterGroups.historical;

  const peopleIdsKey = useMemo(() => {
    if (!showPeople) return "";
    return [...new Set([...roster, ...historicalRoster].map((row) => row.mark.memberId).filter((id): id is string => Boolean(id)))].sort().join(",");
  }, [showPeople, roster, historicalRoster]);

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
  const busyMap = useMemo(
    () => (showBusy ? mergeOccupiedPairs(busyRemote, shownGridStore, me, { year, monthIndex, cet: cetTick }) : undefined),
    [showBusy, busyRemote, shownGridStore, me, year, monthIndex, cetTick],
  );

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
      <ScheduleToolbar
        controls={toolbar}
        brush={brush}
        filters={{ year, monthIndex, onCursorChange, shiftMonth, limits, kinds, filterOptionLimits, toggleLimit, toggleKind, fieldMarks }}
        display={{ editGlow, editPulse, touchLayout, mayActAs, paintOn, countTables, editByButton, canEdit, toggleEdit, isKit, busyHint, setBusyHint }}
        tools={tools}
      />

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
            columns={calendarItems}
            grids={calendarGrids}
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
          <ScheduleViewSettings
            preferences={preferences}
            year={year}
            monthIndex={monthIndex}
            cetTick={cetTick}
            countTables={countTables}
            window={{ settingsPos, z: zOf("settings"), setSettingsPos, onFocus: () => setFront("settings"), onClose: () => setShowSettings(false) }}
            onResetDemo={!isLiveData() ? () => {
              resetDemoSchedules();
              setGridStore(Object.fromEntries(kinds.flatMap((variant) => limits.map((limit) => [
                monthGridKey(variant, limit),
                demoMonthPlan(year, monthIndex, variant, limit),
              ]))));
              showV2Toast("ok", t("schedule.demoResetDone"));
            } : undefined}
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
            {<ScheduleRoster
              roster={roster}
              historicalRoster={historicalRoster}
              auxiliaryLabels={auxiliaryLabels}
              deadTimeByMember={deadTimeByMember}
              kind={kind}
              showTables={countTables && !hideTables}
              onPeek={(row) => { setPeek(row); setFront("user"); }}
            />}
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
        <Dialog
          open={Boolean(missingPlayPair)}
          title={t("schedule.playLimitRequiredTitle")}
          onClose={() => setMissingPlayPair(null)}
          footer={(
            <>
              <Button variant="outline" onClick={() => setMissingPlayPair(null)}>{t("schedule.close")}</Button>
              <Button
                onClick={() => {
                  setMissingPlayPair(null);
                  window.location.hash = "cabinet-game";
                }}
              >
                {t("schedule.openGameSettings")}
              </Button>
            </>
          )}
        >
          {missingPlayPair ? (
            <p className="v2-play-limit-required">
              {t("schedule.playLimitRequiredBody", {
                variant: missingPlayPair.variant === "nitro" ? "Nitro" : "Regular",
                limit: formatLimit(missingPlayPair.limit),
              })}
            </p>
          ) : null}
        </Dialog>
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
