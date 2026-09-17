import { useEffect, useMemo, useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FloatingPanel } from "@/components/ui/floating-panel";
import { MonthGrid } from "../schedule/MonthGrid";
import { MarkChip } from "../schedule/MarkChip";
import { ME, type Mark } from "../schedule/marks";
import { planMonth } from "../schedule/plan";
import { readCet } from "../schedule/cet";
import { rosterFromGrid } from "../schedule/roster";
import { fieldFill, pctLabel } from "../schedule/analytics";
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
    setGrid((prev) => prev.map((row) => row.map((cell) => cell.map((mark) => (mark.t === me.t ? me : mark)))));
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
          if (!seen.has(mark.t)) seen.set(mark.t, mark);
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border bg-card px-3 py-1">
        <span className="text-[10px] font-semibold tracking-wide text-foreground/60 uppercase">{t("schedule.month")}</span>
        <Input
          type="month"
          className="h-7 w-[128px] px-1.5"
          value={toMonthValue(cursor)}
          onChange={(event) => {
            const [nextYear, month] = event.target.value.split("-").map(Number);
            if (nextYear && month) onCursorChange(new Date(nextYear, month - 1, 1));
          }}
        />
        <span className="text-[10px] font-semibold tracking-wide text-foreground/60 uppercase">{t("schedule.limit")}</span>
        <NativeSelect value={limit} onChange={(event) => setLimit(event.target.value)} className="h-7 w-[54px] px-1">
          <option>25</option>
          <option>50</option>
          <option>100</option>
        </NativeSelect>
        <span className="text-[10px] font-semibold tracking-wide text-foreground/60 uppercase">{t("schedule.kind")}</span>
        <NativeSelect defaultValue="nitro" className="h-7 w-[76px] px-1">
          <option value="nitro">nitro</option>
          <option value="regular">regular</option>
        </NativeSelect>
        <span className="text-[10px] font-semibold tracking-wide text-foreground/60 uppercase">{t("schedule.search")}</span>
        <NativeSelect value={focus} onChange={(event) => setFocus(event.target.value)} className="h-7 w-[62px] px-1">
          <option value="">{t("schedule.searchAll")}</option>
          {fieldMarks.map((mark) => (
            <option key={mark.t} value={mark.t}>
              {mark.t}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-1 text-[10px] text-foreground/70">
          <input
            type="checkbox"
            checked={clearPast}
            onChange={(event) => setClearPast(event.target.checked)}
            className="accent-[#2e7000]"
          />
          {t("schedule.clearPast")}
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={showAnalytics ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setShowAnalytics((open) => !open)}
          >
            {t("schedule.analytics")}
          </Button>
          <Button
            size="sm"
            variant={showPlayers ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setShowPlayers((open) => !open)}
          >
            {t("schedule.players")}
          </Button>
          <div className="relative" ref={popRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-1.5 py-1 hover:bg-accent"
            onClick={() => {
              setDraftTables(me.tables);
              setSettingsOpen((open) => !open);
            }}
          >
            <MarkChip mark={me} />
            <span className="text-[11px] tabular-nums text-foreground/70">{me.tables}</span>
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[148px] rounded-md border border-border bg-card p-2 shadow-xl">
              <div className="mb-2 flex items-center gap-1.5">
                <MarkChip mark={{ ...me, tables: draftTables }} />
                <span className="text-[11px] text-muted-foreground">{t("schedule.tablesLabel")}</span>
              </div>
              <NativeSelect
                value={String(draftTables)}
                onChange={(event) => setDraftTables(Number(event.target.value))}
                size={10}
                className="mb-2 h-auto max-h-40 w-full py-1"
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

      <div className="relative min-h-0 flex-1">
        <MonthGrid
          year={year}
          monthIndex={monthIndex}
          me={me}
          clearPast={clearPast}
          focus={focus}
          grid={grid}
          onGridChange={setGrid}
        />
      </div>

      {showAnalytics && (
        <FloatingPanel
          title={t("schedule.analyticsTitle")}
          x={analyticsPos.x}
          y={analyticsPos.y}
          onMove={(x, y) => setAnalyticsPos({ x, y })}
          onClose={() => setShowAnalytics(false)}
        >
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">{t("schedule.analyticsHint", { limit: fill.limit })}</p>
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-semibold">
                <span>{t("schedule.fillAll")}</span>
                <span>{pctLabel(fill.pct)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[#2e7000]" style={{ width: pctLabel(fill.pct) }} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {fill.taken} / {fill.seats}
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-semibold">
                <span>{t("schedule.fillLeft")}</span>
                <span>{pctLabel(fill.futurePct)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[#76a5af]" style={{ width: pctLabel(fill.futurePct) }} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
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
        >
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-header text-[10px] tracking-wide text-header-foreground uppercase">
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
                  <tr key={row.mark.t} className="border-t border-border">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{row.n}</td>
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
          <p className="mt-2 text-[11px] text-muted-foreground">{t("schedule.playersHint")}</p>
        </FloatingPanel>
      )}
    </div>
  );
}
