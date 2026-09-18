import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, hoursOf, type CapacityMap } from "../schedule/capacity";
import { ME, type Mark } from "../schedule/marks";
import { planMonth, type Occupancy } from "../schedule/plan";
import { readCet } from "../schedule/cet";
import { rosterFromGrid } from "../schedule/roster";
import { fieldFill, pctLabel } from "../schedule/analytics";
import { GitMinimalField } from "./GitMinimalField";
import { GRID_SKINS, type GridSkinId } from "./gridSkins";
import { OptField } from "./OptField";
import { TableField } from "./TableField";
import { V2Field } from "./V2Field";
import { V2Float } from "./V2Float";
import { V2MyCalendar } from "./V2MyCalendar";
import { V2Settings } from "./V2Settings";
import { SlotLookPanel } from "./SlotLookPanel";
import { gridsForCalendar } from "./myShifts";
import { type HourLoadMap } from "../schedule/hourLoad";
import { R } from "./tokens";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
  capacity: CapacityMap;
  hourLoad?: HourLoadMap;
};

function monthTitle(date: Date, lang: string) {
  const raw = date.toLocaleDateString(lang.startsWith("en") ? "en-US" : "ru-RU", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\sг\.?$/i, "");
}

export function V2Schedule({ cursor, onCursorChange, capacity, hourLoad }: Props) {
  const { t, i18n } = useTranslation();
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const [grids, setGrids] = useState<Record<string, Occupancy>>(() => ({ 50: planMonth(year, monthIndex, "50") }));
  const [showMine, setShowMine] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const [me, setMe] = useState<Mark>({ ...ME });
  const [hideTables, setHideTables] = useState(false);
  const [dimPast, setDimPast] = useState(true);
  const [hidePastDays, setHidePastDays] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [tablesDraft, setTablesDraft] = useState("11");
  const [limits, setLimits] = useState<string[]>(["50"]);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [kind, setKind] = useState("nitro");
  const [focus, setFocus] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [gridSkin, setGridSkin] = useState<GridSkinId>("opt");
  const [showPeople, setShowPeople] = useState(false);
  const [analyticsPos, setAnalyticsPos] = useState({ x: 760, y: 120 });
  const [peoplePos, setPeoplePos] = useState({ x: 1080, y: 160 });
  const [front, setFront] = useState<"fill" | "people">("fill");
  const [cetTick, setCetTick] = useState(() => readCet());
  const limitsRef = useRef<HTMLDivElement>(null);
  const editPackRef = useRef<HTMLDivElement>(null);
  const tablesInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGrids(Object.fromEntries(limits.map((limit) => [limit, planMonth(year, monthIndex, limit)])));
  }, [year, monthIndex]);

  useEffect(() => {
    const id = window.setInterval(() => setCetTick(readCet()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!limitsOpen) return;
    const close = (event: MouseEvent) => {
      if (!limitsRef.current?.contains(event.target as Node)) setLimitsOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [limitsOpen]);

  useEffect(() => {
    if (!canEdit) setMarkOpen(false);
  }, [canEdit]);

  useEffect(() => {
    if (!markOpen) return;
    setTablesDraft(String(me.tables));
    const id = window.setTimeout(() => tablesInputRef.current?.focus(), 0);
    const close = (event: MouseEvent) => {
      if (!editPackRef.current?.contains(event.target as Node)) setMarkOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", close);
    };
  }, [markOpen]);

  const visibleGrids = useMemo(() => limits.map((limit) => grids[limit]).filter(Boolean), [grids, limits]);
  const roster = useMemo(
    () =>
      visibleGrids.flatMap((grid) => rosterFromGrid(grid, year, monthIndex, cetTick)).reduce((list, row) => {
        if (!list.some((item) => item.mark.t === row.mark.t)) list.push(row);
        return list;
      }, [] as ReturnType<typeof rosterFromGrid>),
    [visibleGrids, year, monthIndex, cetTick],
  );
  const fieldMarks = useMemo(() => {
    const seen = new Map<string, Mark>();
    for (const grid of visibleGrids) {
      for (const row of grid) {
        for (const cell of row) {
          for (const mark of cell) {
            if (mark && !seen.has(mark.t)) seen.set(mark.t, mark);
          }
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.t.localeCompare(b.t));
  }, [visibleGrids]);
  const fill = useMemo(
    () =>
      fieldFill(
        visibleGrids[0] ?? planMonth(year, monthIndex, limits[0] ?? "50"),
        year,
        monthIndex,
        cetTick,
        limits.join(" · "),
        hoursOf(capacity, limits[0] ?? "50"),
      ),
    [visibleGrids, year, monthIndex, cetTick, limits, capacity],
  );

  const toggleLimit = (value: string) => {
    setLimits((prev) => {
      if (prev.includes(value)) return prev.length === 1 ? prev : prev.filter((item) => item !== value);
      return [...prev, value].sort((a, b) => Number(a) - Number(b));
    });
    setGrids((prev) => (prev[value] ? prev : { ...prev, [value]: planMonth(year, monthIndex, value) }));
  };

  const shiftMonth = (delta: number) => onCursorChange(new Date(year, monthIndex + delta, 1));

  const bumpTables = (delta: number) => {
    setTablesDraft((prev) => {
      const n = Number(prev);
      const cur = Number.isFinite(n) ? n : me.tables;
      return String(Math.min(30, Math.max(1, Math.round(cur) + delta)));
    });
  };

  const commitTables = () => {
    const n = Number(tablesDraft);
    const next = Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : me.tables;
    setMe((prev) => ({ ...prev, tables: next }));
    setTablesDraft(String(next));
    setMarkOpen(false);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section
        className={`v2-sched-bar flex h-14 shrink-0 items-center gap-2 border-b px-4${canEdit ? " is-edit" : ""}`}
        style={{ borderColor: canEdit ? "transparent" : R.line, background: canEdit ? undefined : R.header }}
      >
        <button type="button" className="v2-ctrl w-8" onClick={() => shiftMonth(-1)} aria-label="prev">
          <i className="fa-solid fa-chevron-left" />
        </button>
        <label className="relative">
          <span className="v2-ctrl flex min-w-[142px] items-center justify-between px-3 font-semibold">
            {monthTitle(cursor, i18n.language)}
            <i className="fa-regular fa-calendar" style={{ color: R.faint }} />
          </span>
          <input
            type="month"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={`${year}-${String(monthIndex + 1).padStart(2, "0")}`}
            onChange={(event) => {
              const [nextYear, month] = event.target.value.split("-").map(Number);
              if (nextYear && month) onCursorChange(new Date(nextYear, month - 1, 1));
            }}
          />
        </label>
        <button type="button" className="v2-ctrl w-8" onClick={() => shiftMonth(1)} aria-label="next">
          <i className="fa-solid fa-chevron-right" />
        </button>
        <div className="relative" ref={limitsRef}>
          <button type="button" className="v2-ctrl px-3" onClick={() => setLimitsOpen((open) => !open)}>
            Лимит: <span className="v2-mono ml-1">{limits.join(" · ")}</span>
            <i className="fa-solid fa-angle-down ml-2" style={{ color: R.faint }} />
          </button>
          {limitsOpen && (
            <div
              className="absolute z-40 mt-1 w-full overflow-hidden rounded border p-1"
              style={{ background: R.panel, borderColor: R.line }}
            >
              {LIMIT_OPTIONS.map((value) => {
                const on = limits.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    className="flex w-full items-center gap-2 border-0 px-2 py-1.5 text-left text-[12px]"
                    style={{ background: on ? "rgba(34, 211, 238, 0.12)" : "transparent", color: on ? R.cyan : R.text }}
                    onClick={() => toggleLimit(value)}
                  >
                    <i className={`fa-solid ${on ? "fa-check-square" : "fa-square"}`} />
                    <span className="v2-mono">{value}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="relative">
          <span className="v2-ctrl flex items-center px-3">
            {kind === "nitro" ? "Nitro" : "Regular"}
            <i className="fa-solid fa-angle-down ml-2" style={{ color: R.faint }} />
          </span>
          <select className="absolute inset-0 cursor-pointer opacity-0" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="nitro">Nitro</option>
            <option value="regular">Regular</option>
          </select>
        </label>
        <label className="relative">
          <span className="v2-ctrl flex items-center px-3">
            {t("v2.skin.label")}: {t(GRID_SKINS.find((skin) => skin.id === gridSkin)?.labelKey ?? "v2.skin.next")}
            <i className="fa-solid fa-angle-down ml-2" style={{ color: R.faint }} />
          </span>
          <select
            className="absolute inset-0 cursor-pointer opacity-0"
            value={gridSkin}
            onChange={(e) => setGridSkin(e.target.value as GridSkinId)}
          >
            {GRID_SKINS.map((skin) => (
              <option key={skin.id} value={skin.id}>
                {t(skin.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <form className="v2-mark-find relative shrink-0" onSubmit={(e) => e.preventDefault()}>
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px]" style={{ color: R.faint }} />
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
              className="absolute top-1/2 right-0.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[10px] hover:text-white"
              style={{ color: R.faint }}
              title={t("v2.search.clear")}
              aria-label={t("v2.search.clear")}
              onClick={() => setFocus("")}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
          <datalist id="v2-marks">
            {fieldMarks.map((mark) => (
              <option key={mark.t} value={mark.t} />
            ))}
          </datalist>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="v2-ctrl w-8"
            title={t("schedule.myCalendar")}
            onClick={() => {
              setShowMine(true);
              setShowSettings(false);
            }}
          >
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
        <div className={`v2-edit-pack${canEdit ? " is-on" : ""}`} ref={editPackRef}>
          <label className="v2-edit-toggle" title={t("schedule.editModeHint")}>
            <input type="checkbox" checked={canEdit} onChange={(event) => setCanEdit(event.target.checked)} />
            <span>{t("schedule.editMode")}</span>
          </label>
          <div className="v2-mark-sample">
            <button
              type="button"
              className={`v2-opt-cell is-on v2-mark-setup${canEdit ? "" : " is-past"}`}
              style={{ ["--mark" as string]: me.bg, ["--mark-ink" as string]: me.fg } as CSSProperties}
              title={canEdit ? t("schedule.markCardTables") : t("schedule.editModeHint")}
              aria-label={`${me.t} ${me.tables}`}
              aria-expanded={markOpen}
              onClick={() => {
                if (!canEdit) return;
                setMarkOpen((open) => !open);
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="v2-opt-face has-n">
                <b>{me.t}</b>
                <i>{me.tables}</i>
              </span>
            </button>
          </div>
          {markOpen && (
            <div className="v2-mark-card" role="dialog" aria-label={t("schedule.markCardName")}>
              <div className="v2-mark-card-top">
                <span
                  className="v2-opt-cell is-on v2-mark-setup"
                  style={{ ["--mark" as string]: me.bg, ["--mark-ink" as string]: me.fg } as CSSProperties}
                >
                  <span className="v2-opt-face has-n">
                    <b>{me.t}</b>
                    <i>{Number(tablesDraft) || me.tables}</i>
                  </span>
                </span>
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
                  onChange={(event) => setTablesDraft(event.target.value)}
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
        </div>
      </section>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {gridSkin === "git" ? (
          <GitMinimalField
            year={year}
            monthIndex={monthIndex}
            me={me}
            showTables={!hideTables}
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTip={showTip}
            canEdit={canEdit}
            focus={focus}
            limits={limits}
            capacity={capacity}
            grids={grids}
            onGridChange={(limit, next) => setGrids((prev) => ({ ...prev, [limit]: next }))}
          />
        ) : gridSkin === "opt" ? (
          <OptField
            year={year}
            monthIndex={monthIndex}
            me={me}
            showTables={!hideTables}
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTip={showTip}
            canEdit={canEdit}
            focus={focus}
            limits={limits}
            capacity={capacity}
            grids={grids}
            hourLoad={hourLoad}
            onGridChange={(limit, next) => setGrids((prev) => ({ ...prev, [limit]: next }))}
          />
        ) : gridSkin === "table" ? (
          <TableField
            year={year}
            monthIndex={monthIndex}
            me={me}
            showTables={!hideTables}
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTip={showTip}
            canEdit={canEdit}
            focus={focus}
            limits={limits}
            capacity={capacity}
            grids={grids}
            onGridChange={(limit, next) => setGrids((prev) => ({ ...prev, [limit]: next }))}
          />
        ) : (
          <V2Field
            year={year}
            monthIndex={monthIndex}
            me={me}
            showTables={!hideTables}
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTip={showTip}
            canEdit={canEdit}
            focus={focus}
            limits={limits}
            capacity={capacity}
            grids={grids}
            onGridChange={(limit, next) => setGrids((prev) => ({ ...prev, [limit]: next }))}
          />
        )}
        <section className="flex h-12 shrink-0 items-center gap-5 px-4 text-[11px]" style={{ color: R.muted }}>
          <div className="flex items-center gap-3">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: me.bg }} />
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
          </div>
          <p className="ml-auto" style={{ color: R.soft }}>
            {gridSkin === "opt"
              ? t("v2.skin.optHint")
              : "Пользователь смотрит месяц. Видит: где плотно, где ночь даёт 2 места, где прошлое"}
          </p>
        </section>

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
                  <div className="mb-1 flex justify-between text-[12px]" style={{ color: R.soft }}>
                    <span>{row.label}</span>
                    <span className="v2-mono" style={{ color: R.cyan }}>{pctLabel(row.pct)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: R.panel }}>
                    <div className="h-full" style={{ width: pctLabel(row.pct), background: R.cyan }} />
                  </div>
                  <div className="mt-1 v2-mono text-[11px]" style={{ color: R.muted }}>
                    {row.a} / {row.b}
                  </div>
                </div>
              ))}
            </div>
          </V2Float>
        )}
        {showSettings && (
          <V2Settings
            dimPast={dimPast}
            hidePastDays={hidePastDays}
            showTables={!hideTables}
            showTip={showTip}
            onDimPast={setDimPast}
            onHidePastDays={setHidePastDays}
            onShowTables={(value) => setHideTables(!value)}
            onShowTip={setShowTip}
            onOpenLook={() => {
              setShowSettings(false);
              setShowLook(true);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showLook && <SlotLookPanel onClose={() => setShowLook(false)} />}
        {showMine && (
          <V2MyCalendar
            year={year}
            monthIndex={monthIndex}
            title={monthTitle(cursor, i18n.language)}
            tag={me.t}
            grids={gridsForCalendar(grids, year, monthIndex)}
            today={cetTick.year === year && cetTick.monthIndex === monthIndex ? cetTick.day : null}
            onClose={() => setShowMine(false)}
          />
        )}
        {showPeople && (
          <V2Float
            title={t("schedule.playersTitle")}
            x={peoplePos.x}
            y={peoplePos.y}
            z={front === "people" ? 50 : 40}
            onMove={(x, y) => setPeoplePos({ x, y })}
            onFocus={() => setFront("people")}
            onClose={() => setShowPeople(false)}
          >
            {roster.map((row) => (
              <div key={row.mark.t} className="flex items-center gap-2 py-1">
                <span
                  className="v2-mono inline-flex h-5 min-w-8 items-center justify-center px-1 text-[10px] font-bold"
                  style={{ background: row.mark.bg, color: row.mark.fg }}
                >
                  {row.mark.t}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: R.text }}>{row.mark.discord}</span>
                <span className="v2-mono text-[11px]" style={{ color: R.muted }}>{row.hours}</span>
              </div>
            ))}
          </V2Float>
        )}
      </div>
    </main>
  );
}
