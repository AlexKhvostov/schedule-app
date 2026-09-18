import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, hoursOf, type CapacityMap } from "../schedule/capacity";
import { ME, type Mark } from "../schedule/marks";
import { planMonth, type Occupancy } from "../schedule/plan";
import { readCet } from "../schedule/cet";
import { rosterFromGrids } from "../schedule/roster";
import { fieldFill, pctLabel } from "../schedule/analytics";
import { OptField } from "./OptField";
import { V2Float } from "./V2Float";
import { V2MyCalendar } from "./V2MyCalendar";
import { V2Settings } from "./V2Settings";
import { SlotLookPanel } from "./SlotLookPanel";
import { gridsForCalendar, myHoursMatrix, myPlayStats, myTimeline } from "./myShifts";
import { type HourLoadMap } from "../schedule/hourLoad";
import { loadPrefs, savePrefs } from "./prefs";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
  capacity: CapacityMap;
  hourLoad?: HourLoadMap;
  skin?: "classic" | "theme";
};

function monthTitle(date: Date, lang: string) {
  const raw = date.toLocaleDateString(lang.startsWith("en") ? "en-US" : "ru-RU", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\sг\.?$/i, "");
}

function monthShort(index: number, lang: string) {
  const raw = new Date(2026, index, 1).toLocaleDateString(lang.startsWith("en") ? "en-US" : "ru-RU", {
    month: "short",
  });
  return raw.replace(/\./g, "").replace(/\sг\.?$/i, "");
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
}: {
  me: Mark;
  tables: string;
  matrix: ReturnType<typeof myHoursMatrix>;
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  onBump: (delta: number) => void;
  onDraft: (value: string) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const n = Number(tables) || me.tables;

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
    <div className="v2-mark-dock" style={{ left: x, top: y }} role="dialog" aria-label={t("schedule.editDockTitle")}>
      <header
        className="v2-mark-dock-head"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("input, button")) return;
          drag.current = { ox: event.clientX - x, oy: event.clientY - y };
        }}
      >
        <div className="v2-mark-dock-title">
          <b>{t("schedule.editDockTitle")}</b>
          <i className="fa-solid fa-grip-vertical" aria-hidden />
        </div>
        <div className="v2-mark-dock-tools">
          <span className="v2-mark-sample">
            <span
              className="v2-opt-cell is-on v2-mark-setup"
              style={{ ["--mark" as string]: me.bg, ["--mark-ink" as string]: me.fg } as CSSProperties}
            >
              <span className="v2-opt-face has-n">
                <b>{me.t}</b>
                <i>{n}</i>
              </span>
            </span>
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
        {LIMIT_OPTIONS.map((limit) => {
          const marks = matrix.counts[limit] || 0;
          const hours = matrix.totals[limit] || 0;
          return (
            <li key={limit} className={marks ? "is-on" : ""}>
              <b>NL {limit}</b>
              <em>{t("schedule.planMarks", { n: marks })}</em>
              <i>{t("schedule.meHours", { n: hours })}</i>
            </li>
          );
        })}
      </ul>
      <p className="v2-mark-plan-note">{t("schedule.planTableHint")}</p>
      <div className="v2-mark-plan-scroll">
        <table className="v2-mark-plan">
          <thead>
            <tr>
              <th>{t("schedule.planDay")}</th>
              {LIMIT_OPTIONS.map((limit) => (
                <th key={limit}>{limit}</th>
              ))}
              <th className="is-sum">Σ</th>
            </tr>
          </thead>
          <tbody>
            {matrix.hours.map((row, dayIdx) => (
              <tr key={dayIdx}>
                <th>{String(dayIdx + 1).padStart(2, "0")}</th>
                {LIMIT_OPTIONS.map((limit) => (
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
              {LIMIT_OPTIONS.map((limit) => (
                <td key={limit} className={matrix.totals[limit] ? "is-on" : ""}>
                  {matrix.totals[limit] || ""}
                </td>
              ))}
              <td className={`is-sum${matrix.grand ? " is-on" : ""}`}>{matrix.grand || ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>,
    document.body,
  );
}

export function V2Schedule({ cursor, onCursorChange, capacity, hourLoad, skin = "theme" }: Props) {
  const { t, i18n } = useTranslation();
  const isKit = skin === "theme";
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const boot = loadPrefs();
  const [grids, setGrids] = useState<Record<string, Occupancy>>(() =>
    Object.fromEntries(boot.limits.map((limit) => [limit, planMonth(year, monthIndex, limit)])),
  );
  const [showMine, setShowMine] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const [me, setMe] = useState<Mark>({ ...ME });
  const [hideTables, setHideTables] = useState(false);
  const [dimPast, setDimPast] = useState(true);
  const [hidePastDays, setHidePastDays] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [editPulse, setEditPulse] = useState(boot.editPulse);
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

  useEffect(() => {
    setGrids(Object.fromEntries(limits.map((limit) => [limit, planMonth(year, monthIndex, limit)])));
  }, [year, monthIndex]);

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
    if (!canEdit) setMarkOpen(false);
  }, [canEdit]);

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

  const visibleGrids = useMemo(() => limits.map((limit) => grids[limit]).filter(Boolean), [grids, limits]);
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
  const roster = useMemo(
    () => rosterFromGrids(visibleGrids, year, monthIndex, cetTick),
    [visibleGrids, year, monthIndex, cetTick],
  );
  const fill = useMemo(() => {
    const empty = { pct: 0, taken: 0, seats: 0, futurePct: 0, futureTaken: 0, futureSeats: 0 };
    return visibleGrids.reduce((acc, grid, index) => {
      const row = fieldFill(
        grid,
        year,
        monthIndex,
        cetTick,
        limits[index] ?? "",
        hoursOf(capacity, limits[index] ?? "50"),
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
        ...myPlayStats(grids[limit] ? { [limit]: grids[limit] } : {}, me.t, year, monthIndex, cetTick),
      })),
    [grids, limits, me.t, year, monthIndex, cetTick],
  );
  const allGrids = useMemo(() => gridsForCalendar(grids, year, monthIndex), [grids, year, monthIndex]);
  const planMatrix = useMemo(() => (isKit ? myHoursMatrix(allGrids, me.t) : null), [isKit, allGrids, me.t]);
  const busyMap = useMemo(
    () => (isKit && canEdit ? myTimeline(allGrids, me.t) : undefined),
    [isKit, canEdit, allGrids, me.t],
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
      const next = Math.min(30, Math.max(1, Math.round(cur) + delta));
      if (isKit) setMe((mark) => ({ ...mark, tables: next }));
      return String(next);
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
            {monthTitle(cursor, i18n.language)}
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
            {fieldMarks.map((mark) => (
              <option key={mark.t} value={mark.t} />
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
          <label className="v2-edit-toggle" title={t("schedule.editModeHint")}>
            <input
              type="checkbox"
              checked={canEdit}
              onChange={(event) => {
                const on = event.target.checked;
                setCanEdit(on);
                if (isKit) setMarkOpen(on);
              }}
            />
            <span>{t("schedule.editMode")}</span>
          </label>
          {isKit ? null : (
            <>
          <div className="v2-mark-sample">
              <button
                type="button"
                className="v2-opt-cell is-on v2-mark-setup"
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
            </>
          )}
        </div>
        <div className="v2-bar-pack v2-me-stat" title={t("schedule.meStatHint")}>
          {mineByLimit.map((row) => (
            <span key={row.limit}>
              <b>NL {row.limit}</b>
              <em>{t("schedule.meHours", { n: row.hours })}</em>
              <i>{t("schedule.meLeft", { n: row.left })}</i>
            </span>
          ))}
        </div>
        </div>
      </section>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <OptField
          year={year}
          monthIndex={monthIndex}
          me={me}
          showTables={!hideTables}
          dimPast={dimPast}
          hidePastDays={hidePastDays}
          showTip={showTip}
          canEdit={canEdit}
          quietEdit={!editPulse}
          focus={focus}
          limits={limits}
          capacity={capacity}
          grids={grids}
          hourLoad={hourLoad}
          onGridChange={(limit, next) => setGrids((prev) => ({ ...prev, [limit]: next }))}
          skin={skin}
          busy={busyMap}
        />
        <section className="v2-muted flex h-9 shrink-0 items-center gap-5 px-4 text-[11px]">
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
            title={monthTitle(cursor, i18n.language)}
            tag={me.t}
            grids={gridsForCalendar(grids, year, monthIndex)}
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
            onDimPast={setDimPast}
            onHidePastDays={setHidePastDays}
            onShowTables={(value) => setHideTables(!value)}
            onShowTip={setShowTip}
            onEditPulse={(value) => {
              setEditPulse(value);
              savePrefs({ ...loadPrefs(), editPulse: value });
            }}
            onOpenLook={() => {
              setShowSettings(false);
              setShowLook(true);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showLook && <SlotLookPanel onClose={() => setShowLook(false)} />}
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
              const n = Number(value);
              if (Number.isFinite(n)) setMe((mark) => ({ ...mark, tables: Math.min(30, Math.max(1, Math.round(n))) }));
            }}
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
                <span className="min-w-0 flex-1 truncate">{row.mark.discord}</span>
                <span className="v2-mono v2-muted text-[11px]">
                  {row.hours}
                  <span> / {row.left}</span>
                </span>
              </div>
            ))}
          </V2Float>
        )}
      </div>
    </main>
  );
}
