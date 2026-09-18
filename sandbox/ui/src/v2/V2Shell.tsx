import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CET, PLAYER_TZ, formatClock } from "../schedule/cet";
import { defaultCapacity, loadCapacity, saveCapacity, type CapacityMap } from "../schedule/capacity";
import { defaultHourLoad, loadHourLoad, saveHourLoad, type HourLoadMap } from "../schedule/hourLoad";
import { setAppLanguage } from "../i18n";
import { ME } from "../schedule/marks";
import { HeatmapGrid } from "../schedule/HeatmapGrid";
import { planMonth } from "../schedule/plan";
import { V2Schedule } from "./V2Schedule";
import { V2Cabinet } from "./V2Cabinet";
import { V2Admin } from "./V2Admin";
import { R } from "./tokens";
import "./v2.css";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
  onBack: () => void;
};

export function V2Shell({ cursor, onCursorChange, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState("schedule");
  const [capacity, setCapacity] = useState<CapacityMap>(() => (typeof window === "undefined" ? defaultCapacity() : loadCapacity()));
  const [hourLoad, setHourLoad] = useState<HourLoadMap>(() => (typeof window === "undefined" ? defaultHourLoad() : loadHourLoad()));
  const [now, setNow] = useState(() => new Date());
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [heatGrid, setHeatGrid] = useState(() => planMonth(cursor.getFullYear(), cursor.getMonth()));

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setHeatGrid(planMonth(cursor.getFullYear(), cursor.getMonth()));
  }, [cursor]);

  const nav = [
    { key: "schedule", label: lang === "en" ? "Schedule" : "Расписание" },
    { key: "heatmap", label: lang === "en" ? "Heatmap" : "Тепловая карта" },
    { key: "admin", label: lang === "en" ? "Admin" : "Админ" },
  ];

  return (
    <div className="v2-stage">
    <div className="v2-root flex min-h-0 flex-col overflow-hidden">
      <header
        className="z-30 flex h-12 w-full shrink-0 items-center border-b px-4"
        style={{ background: R.header, borderColor: R.line }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <div className="flex items-center gap-2 font-semibold">
            <span
              className="v2-mono grid h-6 w-6 place-items-center rounded text-[11px]"
              style={{ background: R.cyan, color: R.cyanInk }}
            >
              PR
            </span>
            <span>Ротация столов</span>
          </div>
          <nav className="flex h-full items-center gap-1">
            {nav.map((item) => (
              <button
                key={item.key}
                type="button"
                className="flex h-full items-center border-0 bg-transparent px-3"
                style={{
                  color: page === item.key ? "#fff" : R.muted,
                  borderBottom: page === item.key ? `2px solid ${R.cyan}` : "2px solid transparent",
                }}
                onClick={() => setPage(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 px-3">
          <span className="v2-mono text-[15px] font-semibold tabular-nums" style={{ color: R.cyan }}>
            {formatClock(now, CET)}
          </span>
          <span className="text-[9px] font-semibold tracking-[0.14em] uppercase" style={{ color: R.cyan }}>
            CET
          </span>
          <span className="ml-2 v2-mono text-[11px] italic tabular-nums" style={{ color: R.faint }}>
            {formatClock(now, PLAYER_TZ)}
          </span>
          <span className="text-[8px] font-medium tracking-[0.12em] uppercase italic" style={{ color: "#6b7280" }}>
            {t("header.mskLabel")}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-4">
          <div className="flex overflow-hidden rounded border" style={{ borderColor: R.line }}>
            {(["ru", "en"] as const).map((code) => (
              <button
                key={code}
                type="button"
                className="border-0 px-2 py-1 text-[12px]"
                style={{
                  background: lang === code ? R.line : "transparent",
                  color: lang === code ? R.text : R.faint,
                }}
                onClick={() => setAppLanguage(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex items-center gap-2 border-0 bg-transparent"
            onClick={() => setPage("cabinet")}
          >
            <span
              className="v2-mono grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold"
              style={{ background: R.cyan, color: R.cyanInk }}
            >
              {ME.t}
            </span>
            <span style={{ color: R.soft }}>Я</span>
          </button>
          <button
            type="button"
            className="border-0 bg-transparent text-[10px]"
            style={{ color: R.faint }}
            onClick={onBack}
            title={t("v2.back")}
          >
            sandbox
          </button>
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {page === "schedule" && (
        <V2Schedule cursor={cursor} onCursorChange={onCursorChange} capacity={capacity} hourLoad={hourLoad} />
      )}
      {page === "heatmap" && (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
          <section className="flex h-14 items-center gap-2 border-b" style={{ borderColor: R.line }}>
            <button
              type="button"
              className="v2-ctrl w-8"
              onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="prev"
            >
              <i className="fa-solid fa-chevron-left" />
            </button>
            <div className="v2-ctrl min-w-[142px] px-3 font-semibold">
              {(() => {
                const raw = cursor.toLocaleDateString(lang === "en" ? "en-US" : "ru-RU", { month: "long", year: "numeric" });
                return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\sг\.?$/i, "");
              })()}
            </div>
            <button
              type="button"
              className="v2-ctrl w-8"
              onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="next"
            >
              <i className="fa-solid fa-chevron-right" />
            </button>
          </section>
          <div className="mt-3 overflow-auto rounded-sm border p-3" style={{ borderColor: R.line, background: R.header }}>
            <HeatmapGrid
              year={cursor.getFullYear()}
              monthIndex={cursor.getMonth()}
              me={ME}
              grid={heatGrid}
              onGridChange={setHeatGrid}
            />
          </div>
        </div>
      )}
      {page === "admin" && (
        <div className="min-h-0 flex-1 overflow-auto">
          <V2Admin
            capacity={capacity}
            hourLoad={hourLoad}
            onCapacityChange={(next) => {
              setCapacity(next);
              saveCapacity(next);
            }}
            onHourLoadChange={(next) => {
              setHourLoad(next);
              saveHourLoad(next);
            }}
          />
        </div>
      )}
      {page === "cabinet" && <div className="min-h-0 flex-1 overflow-auto"><V2Cabinet /></div>}
      </div>
    </div>
    </div>
  );
}
