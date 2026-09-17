import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { hourRange, isNowSlot, isPastSlot, playerHourOffset, playerHourRange, readCet, type CetStamp } from "./cet";
import { MarkChip } from "./MarkChip";
import { type Mark } from "./marks";
import { capFor, daysInMonth } from "./plan";

const SLOT_W = 20;
const SLOT_H = 30;
const SLOT_PAD = 2;
const SLOT_DASH = 2;
const INNER_W = SLOT_W - SLOT_PAD * 2;
const INNER_H = SLOT_H - SLOT_PAD * 2;
const HALF_H = (INNER_H - SLOT_DASH) / 2;
const SHADE = "rgba(18, 20, 26, 0.55)";
const DAY_COL = 52;
const TABLE_W = DAY_COL + 48 * SLOT_W;

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  clearPast: boolean;
  focus: string;
  grid: Mark[][][];
  onGridChange: (next: Mark[][][]) => void;
};

type Hover = { dayIdx: number; half: number; x: number; y: number };

function slotTime(half: number) {
  return `${String(Math.floor(half / 2)).padStart(2, "0")}:${half % 2 ? "30" : "00"}`;
}

function markMuted(mark: Mark, focus: string) {
  const q = focus.trim().toUpperCase();
  if (!q) return false;
  return mark.t.toUpperCase() !== q;
}

export function MonthGrid({ year, monthIndex, me, clearPast, focus, grid, onGridChange }: Props) {
  const { t, i18n } = useTranslation();
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const [hover, setHover] = useState<Hover | null>(null);
  const [cet, setCet] = useState<CetStamp>(() => readCet());

  useEffect(() => {
    const id = window.setInterval(() => setCet(readCet()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (dayIdx: number, half: number) => {
    onGridChange(
      grid.map((row, r) =>
        row.map((cell, c) => {
          if (r !== dayIdx || c !== half) return cell;
          const next = [...cell];
          const mine = next.findIndex((m) => m.t === me.t);
          if (mine >= 0) next.splice(mine, 1);
          else if (next.length < capFor(half)) next.push(me);
          return next;
        }),
      ),
    );
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const halves = Array.from({ length: 48 }, (_, i) => i);
  const hoverHour = hover ? Math.floor(hover.half / 2) : null;
  const hoverDay = hover ? days[hover.dayIdx] : null;
  const hoverWho = hover ? (grid[hover.dayIdx]?.[hover.half] ?? []) : [];
  const hoverCap = hover ? capFor(hover.half) : 1;
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const mskOffset = playerHourOffset();

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
      <div className="inline-block rounded-lg bg-card p-2 ring-1 ring-border">
        <table className="table-fixed border-collapse" style={{ width: TABLE_W }} onMouseLeave={() => setHover(null)}>
          <colgroup>
            <col style={{ width: DAY_COL }} />
            {halves.map((half) => (
              <col key={half} style={{ width: SLOT_W }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-header px-1 text-left">
                <div className="flex h-[15px] items-center text-[9px] font-bold tracking-[0.08em] text-white uppercase">
                  {t("header.timezone")}
                </div>
                <div className="flex h-[13px] items-center text-[9px] font-bold tracking-[0.08em] text-[#7eb6ff]/80 uppercase">
                  {t("header.mskLabel")}
                </div>
              </th>
              {hours.map((h) => (
                <th
                  key={h}
                  colSpan={2}
                  className={cn(
                    "sticky top-0 z-10 text-center transition-colors",
                    hoverHour === h ? "bg-primary text-primary-foreground" : "bg-header text-header-foreground",
                  )}
                >
                  <span className="relative inline-flex flex-col items-center">
                    <span className="flex h-[15px] items-center text-[10px] font-bold tabular-nums">{hourRange(h)}</span>
                    <span
                      className={cn(
                        "flex h-[13px] items-center text-[8px] font-semibold tabular-nums",
                        hoverHour === h ? "text-[#1d4ed8]/80" : "text-[#7eb6ff]/75",
                      )}
                    >
                      {playerHourRange(h, mskOffset)}
                    </span>
                    {sameMonth && cet.hour === h && (
                      <span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-rose-500" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dayIdx) => (
              <tr key={day.d} className="border-b-2 border-header">
                <th
                  className={cn(
                    "sticky left-0 z-10 border-b-2 border-header px-1.5 text-left text-[11px] font-semibold tabular-nums transition-colors",
                    hover?.dayIdx === dayIdx || (sameMonth && cet.day === day.d)
                      ? "bg-primary text-primary-foreground"
                      : cn("bg-header text-header-foreground", day.weekend && "text-primary"),
                  )}
                  style={{ height: SLOT_H, width: DAY_COL }}
                >
                  {String(day.d).padStart(2, "0")}
                  <span
                    className={cn(
                      "ml-1 font-medium",
                      hover?.dayIdx === dayIdx || (sameMonth && cet.day === day.d)
                        ? "text-primary-foreground/80"
                        : "text-white/70",
                    )}
                  >
                    {day.wd}
                  </span>
                  {sameMonth && cet.day === day.d && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-500 align-middle" />
                  )}
                </th>
                {halves.map((half) => {
                  const who = grid[dayIdx]?.[half] ?? [];
                  const hourStart = half % 2 === 0 && half > 0;
                  const active = hover?.dayIdx === dayIdx && hover.half === half;
                  const past = isPastSlot(year, monthIndex, day.d, half, cet);
                  const now = isNowSlot(year, monthIndex, day.d, half, cet);
                  const cap = capFor(half);
                  return (
                    <td
                      key={half}
                      className={cn(
                        "relative cursor-pointer border-b-2 border-header bg-[#eef1f4] p-0 align-top",
                        hourStart && "shadow-[inset_1px_0_0_#c5cad3]",
                        active && "ring-1 ring-inset ring-[#2e7000]",
                      )}
                      style={{ width: SLOT_W, height: SLOT_H }}
                      onMouseEnter={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        const x = Math.min(box.right + 8, window.innerWidth - 180);
                        const y = Math.min(box.top, window.innerHeight - 140);
                        setHover({ dayIdx, half, x, y });
                      }}
                      onClick={() => toggle(dayIdx, half)}
                    >
                      {cap === 2 ? (
                        <div
                          className="flex flex-col overflow-hidden leading-none"
                          style={{ width: SLOT_W, height: SLOT_H, padding: SLOT_PAD, boxSizing: "border-box" }}
                        >
                          <div className="overflow-hidden" style={{ width: INNER_W, height: HALF_H }}>
                            {who[0] && (
                              <MarkChip
                                mark={who[0]}
                                width={INNER_W}
                                height={HALF_H}
                                muted={markMuted(who[0], focus)}
                              />
                            )}
                          </div>
                          <div
                            className="shrink-0 border-t border-dashed border-[#8a9099]"
                            style={{ height: SLOT_DASH, width: INNER_W }}
                          />
                          <div className="overflow-hidden" style={{ width: INNER_W, height: HALF_H }}>
                            {who[1] && (
                              <MarkChip
                                mark={who[1]}
                                width={INNER_W}
                                height={HALF_H}
                                muted={markMuted(who[1], focus)}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="overflow-hidden leading-none"
                          style={{ width: SLOT_W, height: SLOT_H, padding: SLOT_PAD, boxSizing: "border-box" }}
                        >
                          {who[0] && (
                            <MarkChip
                              mark={who[0]}
                              width={INNER_W}
                              height={INNER_H}
                              muted={markMuted(who[0], focus)}
                            />
                          )}
                        </div>
                      )}
                      {!clearPast && past && (
                        <span className="pointer-events-none absolute inset-0 z-[4]" style={{ background: SHADE }} />
                      )}
                      {!clearPast && now && (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-0 z-[4]"
                          style={{
                            width: `${Math.min(cet.slotProgress, 1) * 100}%`,
                            background: SHADE,
                          }}
                        />
                      )}
                      {now && (
                        <span
                          className="pointer-events-none absolute top-0 z-[6] h-full w-0.5 bg-rose-500 shadow-[0_0_6px_#f43f5e]"
                          style={{ left: `${Math.min(cet.slotProgress, 0.96) * 100}%` }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {hover && hoverDay && (
          <div
            className="pointer-events-none fixed z-50 min-w-[168px] rounded-md bg-[#1f2430] px-2 py-1.5 text-[11px] text-white shadow-lg ring-1 ring-white/12"
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="mb-1 font-mono text-[11px] font-semibold tabular-nums">
              {String(hoverDay.d).padStart(2, "0")} {hoverDay.wd}
              <span className="mx-1 text-white/35">·</span>
              {slotTime(hover.half)}
            </div>
            <div className="grid gap-0.5">
              {Array.from({ length: hoverCap }, (_, i) => {
                const person = hoverWho[i];
                return (
                  <div key={i} className="flex h-8 items-center gap-1.5">
                    {person ? (
                      <>
                        <MarkChip mark={person} height={hoverCap === 2 ? 12 : 16} muted={markMuted(person, focus)} />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate">{person.discord}</span>
                          <span className="block truncate text-[10px] text-white/55">{person.room}</span>
                        </span>
                        <span className="ml-auto tabular-nums text-white/55">{person.tables}</span>
                      </>
                    ) : (
                      <>
                        <span
                          className="inline-block shrink-0 rounded-[2px] border border-dashed border-white/25"
                          style={{ width: 16, height: 8 }}
                        />
                        <span className="text-white/40">{t("schedule.empty")}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
