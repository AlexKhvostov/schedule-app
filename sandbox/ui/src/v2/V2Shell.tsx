import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CET, formatClock } from "../schedule/cet";
import { defaultCapacity, loadCapacity, saveCapacity, type CapacityMap } from "../schedule/capacity";
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
  const [now, setNow] = useState(() => new Date());
  const lang = i18n.language.startsWith("en") ? "en" : "ru";
  const [heatGrid, setHeatGrid] = useState(() => planMonth(cursor.getFullYear(), cursor.getMonth()));

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = R.bg;
    body.style.background = R.bg;
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, []);

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
    <div className="v2-root flex min-h-0 flex-col overflow-hidden">
      <header
        className="z-30 flex h-12 w-full shrink-0 items-center gap-6 border-b px-4"
        style={{ background: R.header, borderColor: R.line }}
      >
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
        <div className="ml-auto flex items-center gap-4">
          <div className="v2-mono" style={{ color: R.cyan }}>
            <i className="fa-regular fa-clock mr-2" />
            {formatClock(now, CET)} CET
          </div>
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
      {page === "schedule" && <V2Schedule cursor={cursor} onCursorChange={onCursorChange} capacity={capacity} />}
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
            onCapacityChange={(next) => {
              setCapacity(next);
              saveCapacity(next);
            }}
          />
        </div>
      )}
      {page === "cabinet" && <div className="min-h-0 flex-1 overflow-auto"><V2Cabinet /></div>}
      </div>
    </div>
  );
}
