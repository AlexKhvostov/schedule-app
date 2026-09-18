import { useEffect, useMemo, useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { MonthGrid } from "../schedule/MonthGrid";
import { LevelGrid } from "../schedule/LevelGrid";
import { MarkChip } from "../schedule/MarkChip";
import { ME, type Mark } from "../schedule/marks";
import { planMonth } from "../schedule/plan";
import { readCet } from "../schedule/cet";
import { rosterFromGrid } from "../schedule/roster";
import { fieldFill, pctLabel } from "../schedule/analytics";
import { GRID_DARK } from "../schedule/theme";
import { useTranslation } from "react-i18next";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
};

function toMonthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function SchedulePage({ cursor, onCursorChange }: Props) {
  const { t } = useTranslation();
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const [grid, setGrid] = useState(() => planMonth(year, monthIndex));
  const [me, setMe] = useState<Mark>({ ...ME });
  const [draftTables, setDraftTables] = useState(ME.tables);
  const [clearPast, setClearPast] = useState(false);
  const [hideTables, setHideTables] = useState(false);
  const [view, setView] = useState<"slots" | "levels">("levels");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [analyticsPos, setAnalyticsPos] = useState({ x: 420, y: 120 });
  const [playersPos, setPlayersPos] = useState({ x: 460, y: 160 });
  const [limit, setLimit] = useState("50");
  const [focus, setFocus] = useState("");
  const [cetTick, setCetTick] = useState(() => readCet());
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGrid(planMonth(year, monthIndex));
  }, [year, monthIndex]);

  useEffect(() => {
    const id = window.setInterval(() => setCetTick(readCet()), 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setGrid((prev) =>
      prev.map((row) =>
        row.map((cell) => cell.map((mark) => (mark && mark.t === me.t ? me : mark))),
      ),
    );
  }, [me]);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: MouseEvent) => {
      if (!popRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  const roster = useMemo(() => rosterFromGrid(grid, year, monthIndex, cetTick), [grid, year, monthIndex, cetTick]);
  const fieldMarks = useMemo(() => {
    const seen = new Map<string, Mark>();
    for (const row of grid) {
      for (const cell of row) {
        for (const mark of cell) {
          if (mark && !seen.has(mark.t)) seen.set(mark.t, mark);
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.t.localeCompare(b.t));
  }, [grid]);
  const fill = useMemo(
    () => fieldFill(grid, year, monthIndex, cetTick, limit),
    [grid, year, monthIndex, cetTick, limit],
  );

  const saveTables = () => {
    setMe((prev) => ({ ...prev, tables: draftTables }));
    setSettingsOpen(false);
  };

  const controlStyle = {
    borderColor: GRID_DARK.line,
    background: GRID_DARK.canvas,
    color: GRID_DARK.text,
  } as const;
  const labelStyle = { color: GRID_DARK.hint } as const;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: GRID_DARK.canvas, colorScheme: "dark" }}
    >
      <div
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b px-3 py-1"
        style={{ background: GRID_DARK.bar, borderColor: GRID_DARK.line }}
      >
        <span className="text-[10px] font-semibold tracking-wide uppercase" style={labelStyle}>
          {t("schedule.month")}
        </span>
        <Input
          type="month"
          className="h-7 w-[128px] px-1.5 shadow-none"
          style={controlStyle}
          value={toMonthValue(cursor)}
          onChange={(event) => {
            const [nextYear, month] = event.target.value.split("-").map(Number);
            if (nextYear && month) onCursorChange(new Date(nextYear, month - 1, 1));
          }}
        />
        <span className="text-[10px] font-semibold tracking-wide uppercase" style={labelStyle}>
          {t("schedule.limit")}
        </span>
        <NativeSelect value={limit} onChange={(event) => setLimit(event.target.value)} className="h-7 w-[64px] px-1" style={controlStyle}>
          <option>25</option>
          <option>50</option>
          <option>100</option>
          <option>250</option>
          <option>500</option>
        </NativeSelect>
        <span className="text-[10px] font-semibold tracking-wide uppercase" style={labelStyle}>
          {t("schedule.kind")}
        </span>
        <NativeSelect defaultValue="nitro" className="h-7 w-[76px] px-1" style={controlStyle}>
          <option value="nitro">nitro</option>
          <option value="regular">regular</option>
        </NativeSelect>
        <span className="text-[10px] font-semibold tracking-wide uppercase" style={labelStyle}>
          {t("schedule.search")}
        </span>
        <NativeSelect value={focus} onChange={(event) => setFocus(event.target.value)} className="h-7 w-[62px] px-1" style={controlStyle}>
          <option value="">{t("schedule.searchAll")}</option>
          {fieldMarks.map((mark) => (
            <option key={mark.t} value={mark.t}>
              {mark.t}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-1 text-[10px]" style={{ color: GRID_DARK.text }}>
          <input
            type="checkbox"
            checked={clearPast}
            onChange={(event) => setClearPast(event.target.checked)}
            className="accent-[#ffd966]"
          />
          {t("schedule.clearPast")}
        </label>
        <label className="flex items-center gap-1 text-[10px]" style={{ color: GRID_DARK.text }}>
          <input
            type="checkbox"
            checked={hideTables}
            onChange={(event) => setHideTables(event.target.checked)}
            className="accent-[#ffd966]"
          />
          {t("schedule.hideTables")}
        </label>
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: GRID_DARK.line }}
          role="group"
          aria-label={t("schedule.view")}
        >
          <button
            type="button"
            className="h-7 px-2 text-[10px] font-semibold tracking-wide uppercase"
            style={{
              background: view === "slots" ? "#ffd966" : GRID_DARK.canvas,
              color: view === "slots" ? "#1a1c1e" : GRID_DARK.text,
            }}
            onClick={() => setView("slots")}
          >
            {t("schedule.viewSlots")}
          </button>
          <button
            type="button"
            className="h-7 px-2 text-[10px] font-semibold tracking-wide uppercase"
            style={{
              background: view === "levels" ? "#ffd966" : GRID_DARK.canvas,
              color: view === "levels" ? "#1a1c1e" : GRID_DARK.text,
              borderLeft: `1px solid ${GRID_DARK.line}`,
            }}
            onClick={() => setView("levels")}
          >
            {t("schedule.viewLevels")}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={showAnalytics ? "default" : "outline"}
            className={
              showAnalytics
                ? "h-7 px-2 text-[11px]"
                : "h-7 px-2 text-[11px] border-[#2a313c] bg-transparent text-[#e6edf3] hover:bg-white/10 hover:text-[#e6edf3]"
            }
            onClick={() => setShowAnalytics((open) => !open)}
          >
            {t("schedule.analytics")}
          </Button>
          <Button
            size="sm"
            variant={showPlayers ? "default" : "outline"}
            className={
              showPlayers
                ? "h-7 px-2 text-[11px]"
                : "h-7 px-2 text-[11px] border-[#2a313c] bg-transparent text-[#e6edf3] hover:bg-white/10 hover:text-[#e6edf3]"
            }
            onClick={() => setShowPlayers((open) => !open)}
          >
            {t("schedule.players")}
          </Button>
          <div className="relative" ref={popRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border px-1.5 py-1 hover:bg-white/6"
            style={{ borderColor: GRID_DARK.line, background: GRID_DARK.canvas }}
            onClick={() => {
              setDraftTables(me.tables);
              setSettingsOpen((open) => !open);
            }}
          >
            <MarkChip mark={me} />
            <span className="text-[11px] tabular-nums" style={{ color: GRID_DARK.hint }}>{me.tables}</span>
          </button>
          {settingsOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] z-50 w-[148px] rounded-md border p-2 shadow-xl"
              style={{ borderColor: GRID_DARK.line, background: GRID_DARK.bar }}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <MarkChip mark={{ ...me, tables: draftTables }} />
                <span className="text-[11px]" style={{ color: GRID_DARK.hint }}>{t("schedule.tablesLabel")}</span>
              </div>
              <NativeSelect
                value={String(draftTables)}
                onChange={(event) => setDraftTables(Number(event.target.value))}
                size={10}
                className="mb-2 h-auto max-h-40 w-full py-1"
                style={controlStyle}
              >
                {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
              <Button className="h-7 w-full" onClick={saveTables}>
                {t("schedule.ok")}
              </Button>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {view === "levels" ? (
          <LevelGrid
            year={year}
            monthIndex={monthIndex}
            me={me}
            clearPast={clearPast}
            showTables={!hideTables}
            focus={focus}
            grid={grid}
            onGridChange={setGrid}
          />
        ) : (
          <MonthGrid
            year={year}
            monthIndex={monthIndex}
            me={me}
            clearPast={clearPast}
            showTables={!hideTables}
            focus={focus}
            grid={grid}
            onGridChange={setGrid}
          />
        )}
      </div>

      {showAnalytics && (
        <FloatingPanel
          title={t("schedule.analyticsTitle")}
          x={analyticsPos.x}
          y={analyticsPos.y}
          onMove={(x, y) => setAnalyticsPos({ x, y })}
          onClose={() => setShowAnalytics(false)}
          className="border-[#2a313c] bg-[#161a21] text-[#e6edf3]"
        >
          <div className="space-y-3 text-sm">
            <p className="text-xs" style={{ color: GRID_DARK.hint }}>{t("schedule.analyticsHint", { limit: fill.limit })}</p>
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-semibold">
                <span>{t("schedule.fillAll")}</span>
                <span>{pctLabel(fill.pct)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: GRID_DARK.line }}>
                <div className="h-full bg-[#ffd966]" style={{ width: pctLabel(fill.pct) }} />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: GRID_DARK.hint }}>
                {fill.taken} / {fill.seats}
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-semibold">
                <span>{t("schedule.fillLeft")}</span>
                <span>{pctLabel(fill.futurePct)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: GRID_DARK.line }}>
                <div className="h-full bg-[#76a5af]" style={{ width: pctLabel(fill.futurePct) }} />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: GRID_DARK.hint }}>
                {fill.futureTaken} / {fill.futureSeats}
              </div>
            </div>
          </div>
        </FloatingPanel>
      )}

      {showPlayers && (
        <FloatingPanel
          title={t("schedule.playersTitle")}
          x={playersPos.x}
          y={playersPos.y}
          onMove={(x, y) => setPlayersPos({ x, y })}
          onClose={() => setShowPlayers(false)}
          width={420}
          className="border-[#2a313c] bg-[#161a21] text-[#e6edf3]"
        >
          <div className="overflow-auto rounded-md border" style={{ borderColor: GRID_DARK.line }}>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] tracking-wide uppercase" style={{ background: GRID_DARK.canvas, color: GRID_DARK.hint }}>
                <tr>
                  <th className="px-2 py-1.5 font-semibold">№</th>
                  <th className="px-2 py-1.5 font-semibold">{t("schedule.colMark")}</th>
                  <th className="px-2 py-1.5 font-semibold">{t("schedule.colDiscord")}</th>
                  <th className="px-2 py-1.5 font-semibold">{t("schedule.colRoom")}</th>
                  <th className="px-2 py-1.5 font-semibold">{t("schedule.colHours")}</th>
                  <th className="px-2 py-1.5 font-semibold">{t("schedule.colLeft")}</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={row.mark.t} className="border-t" style={{ borderColor: GRID_DARK.line }}>
                    <td className="px-2 py-1.5 tabular-nums" style={{ color: GRID_DARK.hint }}>{row.n}</td>
                    <td className="px-2 py-1.5">
                      <MarkChip mark={row.mark} />
                    </td>
                    <td className="px-2 py-1.5 font-medium">{row.mark.discord}</td>
                    <td className="px-2 py-1.5">{row.mark.room}</td>
                    <td className="px-2 py-1.5 tabular-nums">{row.hours}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold">{row.left}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: GRID_DARK.hint }}>{t("schedule.playersHint")}</p>
        </FloatingPanel>
      )}
    </div>
  );
}
