import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type MutableRefObject, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isPastDay, isPastSlot, playerHourOffset, readCet, type CetStamp } from "../schedule/cet";
import { type Mark } from "../schedule/marks";
import { hoursOf, lanesForDay, limitTone, weekdayOf, type CapacityMap } from "../schedule/capacity";
import { daysInMonth, levelAllowed, seatsOf, toggleSeat, type Occupancy } from "../schedule/plan";
import { columnFill, pctLabel } from "../schedule/analytics";
import { loadGradient, type HourLoadMap } from "../schedule/hourLoad";
import { lookToVars, loadSlotLook, SLOT_LOOK_EVENT } from "../schedule/slotLook";

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  showTables: boolean;
  dimPast: boolean;
  hidePastDays?: boolean;
  showTip: boolean;
  canEdit: boolean;
  quietEdit?: boolean;
  focus: string;
  limits: string[];
  capacity: CapacityMap;
  grids: Record<string, Occupancy>;
  hourLoad?: HourLoadMap;
  onGridChange: (limit: string, next: Occupancy) => void;
  skin?: "classic" | "theme";
  busy?: (string | null)[][];
};

type SlotHit = {
  cell: HTMLElement;
  dayIdx: number;
  day: number;
  half: number;
  hour: number;
  level: number;
  limit: string;
  lane: string;
  busyLimit?: string;
  x: number;
  y: number;
};

type NavMem = {
  block: Element | null;
  hour: HTMLElement | null;
  lane: Element | null;
  hours: Element | null;
  frame: HTMLDivElement | null;
  col: string;
};

const navMem = new WeakMap<HTMLElement, NavMem>();

const SLOT_COUNT = 48;
const CLICK_WAIT = 220;

function slotSpan(half: number, hourShift = 0) {
  const start = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  const end = (start + 30) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  const loc = lang.startsWith("en") ? "en-US" : "ru-RU";
  const date = new Date(year, monthIndex, day);
  const weekday = date.toLocaleDateString(loc, { weekday: "short" }).replace(".", "");
  const rest = date.toLocaleDateString(loc, { day: "numeric", month: "short" }).replace(".", "");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${rest}`;
}

function tablesLabel(count: number, lang: string) {
  if (lang.startsWith("en")) return count === 1 ? "1 table" : `${count} tables`;
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return `${count} стол`;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${count} стола`;
  return `${count} столов`;
}

function markQuery(focus: string) {
  return focus.trim().toUpperCase();
}

function nowAlongTrack(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `var(--opt-pad-l) + (100% - var(--opt-nl-w) - var(--opt-nl-gap) - var(--opt-pad-l) - var(--opt-pad-r) - 47 * var(--opt-gap)) * ${cell + frac} / ${SLOT_COUNT} + ${cell} * var(--opt-gap)`;
}

function nowHeadLeft(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `calc(var(--opt-pad-l) + (100% - var(--opt-pad-l) - var(--opt-pad-r) - 47 * var(--opt-gap)) * ${cell + frac} / ${SLOT_COUNT} + ${cell} * var(--opt-gap))`;
}

function nowLineLeft(half: number, progress: number) {
  return `calc(var(--opt-nl-w) + var(--opt-nl-gap) + ${nowAlongTrack(half, progress)})`;
}

function lanesOf(capacity: CapacityMap, limit: string, day: number, year: number, monthIndex: number) {
  return Array.from({ length: lanesForDay(capacity, limit, day, year, monthIndex) }, (_, i) => i);
}

function hitFromEvent(target: EventTarget | null, root: HTMLElement | null, withPos = false): SlotHit | null {
  if (!root || !(target instanceof Element)) return null;
  const el = target.closest("[data-slot]");
  if (!el || !root.contains(el) || !(el instanceof HTMLElement)) return null;
  let x = 0;
  let y = 0;
  if (withPos) {
    const box = el.getBoundingClientRect();
    x = box.right + 8;
    y = box.top;
    if (x + 200 > window.innerWidth - 8) x = Math.max(8, box.left - 208);
    if (y + 100 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 108);
  }
  return {
    cell: el,
    dayIdx: Number(el.dataset.day),
    day: Number(el.dataset.d),
    half: Number(el.dataset.half),
    hour: Number(el.dataset.h),
    level: Number(el.dataset.level),
    limit: el.dataset.limit ?? "",
    lane: el.dataset.lane ?? "",
    busyLimit: el.dataset.busy || undefined,
    x,
    y,
  };
}

function navOf(root: HTMLElement): NavMem {
  let mem = navMem.get(root);
  if (!mem) {
    mem = { block: null, hour: null, lane: null, hours: null, frame: null, col: "" };
    navMem.set(root, mem);
  }
  return mem;
}

function frameOf(root: HTMLElement, mem: NavMem) {
  if (mem.frame?.isConnected) return mem.frame;
  mem.frame = root.querySelector(".v2-opt-frame");
  return mem.frame;
}

function hideFrame(mem: NavMem) {
  if (!mem.frame) return;
  mem.frame.hidden = true;
  mem.col = "";
}

function placeFrame(root: HTMLElement, mem: NavMem, hit: SlotHit, label: string) {
  const frame = frameOf(root, mem);
  if (!frame) return;
  const host = frame.parentElement;
  if (!host) return;
  const kit = root.classList.contains("is-kit");
  const scope =
    (kit ? hit.cell.closest(".v2-opt-limit") : null) ?? hit.cell.closest(".v2-opt-lanes");
  if (!scope) return;
  const cells = scope.querySelectorAll<HTMLElement>(`[data-slot][data-h="${hit.hour}"]`);
  if (!cells.length) return;
  const hostBox = host.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const cell of cells) {
    const box = cell.getBoundingClientRect();
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  const pad = kit ? 2 : 3;
  const cap = 11;
  const col = String(hit.hour);
  frame.style.left = `${left - hostBox.left - pad}px`;
  frame.style.top = `${top - hostBox.top - pad - cap}px`;
  frame.style.width = `${right - left + pad * 2}px`;
  frame.style.height = `${bottom - top + pad * 2 + cap}px`;
  frame.style.bottom = "auto";
  if (mem.col !== col) {
    frame.textContent = label;
    mem.col = col;
  }
  frame.hidden = false;
}

function applyNav(root: HTMLElement, hit: SlotHit | null) {
  const kit = root.classList.contains("is-kit");
  const editing = root.classList.contains("is-edit");
  const mem = navOf(root);
  if (!hit) {
    if (!root.dataset.row && !mem.block && !mem.hour) return;
    mem.block?.classList.remove("is-hot");
    mem.lane?.classList.remove("is-hot");
    mem.hour?.classList.remove("is-hot", "is-early", "is-late");
    mem.block = null;
    mem.lane = null;
    mem.hour = null;
    delete root.dataset.row;
    delete root.dataset.lane;
    delete root.dataset.half;
    hideFrame(mem);
    return;
  }
  const col = String(hit.hour);
  const slot = String(hit.half);
  const row = String(hit.dayIdx);
  const lane = hit.lane;
  const late = hit.half % 2 === 1;
  if (kit && root.dataset.row === row && mem.hour?.dataset.h === col && root.dataset.lane === lane) {
    if (!editing || (!mem.frame?.hidden && mem.col === col)) return;
  } else if (!kit && root.dataset.half === slot && root.dataset.row === row && root.dataset.lane === lane) {
    return;
  }
  const nextBlock = hit.cell.closest(".v2-opt-block");
  if (mem.block !== nextBlock) {
    mem.block?.classList.remove("is-hot");
    nextBlock?.classList.add("is-hot");
    mem.block = nextBlock;
  }
  if (!kit) {
    const nextLane = nextBlock?.querySelector(`[data-lane="${lane}"]`) ?? null;
    if (mem.lane !== nextLane) {
      mem.lane?.classList.remove("is-hot");
      nextLane?.classList.add("is-hot");
      mem.lane = nextLane;
    }
  } else if (mem.lane) {
    mem.lane.classList.remove("is-hot");
    mem.lane = null;
  }
  if (!mem.hours) mem.hours = root.querySelector(".v2-opt-hours");
  const nextHour = (mem.hours?.querySelector(`[data-h="${col}"]`) as HTMLElement | null) ?? null;
  if (mem.hour !== nextHour) {
    mem.hour?.classList.remove("is-hot", "is-early", "is-late");
    if (nextHour) {
      nextHour.classList.add("is-hot");
      if (!kit) {
        nextHour.classList.toggle("is-late", late);
        nextHour.classList.toggle("is-early", !late);
      }
    }
    mem.hour = nextHour;
  } else if (mem.hour && !kit) {
    mem.hour.classList.toggle("is-late", late);
    mem.hour.classList.toggle("is-early", !late);
  }
  root.dataset.row = row;
  root.dataset.lane = lane;
  root.dataset.half = slot;
  if (editing) placeFrame(root, mem, hit, `${hit.hour}–${hit.hour + 1}`);
  else hideFrame(mem);
}

function OptFace({ tag, tables, showTables }: { tag?: string; tables?: number; showTables: boolean }) {
  if (!tag) return null;
  return (
    <span className={`v2-opt-face${showTables && tables != null ? " has-n" : ""}`}>
      <b>{tag}</b>
      {showTables && tables != null && <i>{tables}</i>}
    </span>
  );
}

const OptCell = memo(function OptCell({
  dayIdx,
  day,
  half,
  level,
  limit,
  lane,
  tag,
  tables,
  bg,
  fg,
  showTables,
  past,
  locked,
  muted,
  hit,
  nowPct,
  busyLimit,
}: {
  dayIdx: number;
  day: number;
  half: number;
  level: number;
  limit: string;
  lane: string;
  tag?: string;
  tables?: number;
  bg?: string;
  fg?: string;
  showTables: boolean;
  past: boolean;
  locked: boolean;
  muted: boolean;
  hit: boolean;
  nowPct?: number;
  busyLimit?: string;
}) {
  return (
    <div
      role="gridcell"
      data-slot=""
      data-day={dayIdx}
      data-d={day}
      data-half={half}
      data-h={Math.floor(half / 2)}
      data-level={level}
      data-limit={limit}
      data-lane={lane}
      data-busy={busyLimit || undefined}
      className={`v2-opt-cell${past ? " is-past" : ""}${locked ? " is-lock" : ""}${tag ? " is-on" : ""}${muted ? " is-dim" : ""}${hit ? " is-hit" : ""}${nowPct != null ? " is-now" : ""}`}
      style={
        {
          "--mark": bg,
          "--mark-ink": fg,
          "--opt-now-pct": nowPct != null ? `${nowPct}%` : undefined,
        } as CSSProperties
      }
    >
      <OptFace tag={tag} tables={tables} showTables={showTables} />
      {nowPct != null && (
        <span className="v2-opt-now-dim" aria-hidden>
          <OptFace tag={tag} tables={tables} showTables={showTables} />
        </span>
      )}
    </div>
  );
});

const OptNowLine = memo(function OptNowLine({ cet }: { cet: CetStamp }) {
  return <span className="v2-opt-now" style={{ left: nowLineLeft(cet.half, cet.slotProgress) }} aria-hidden />;
});

const OptHeadNow = memo(function OptHeadNow({ cet }: { cet: CetStamp }) {
  return <span className="v2-opt-head-now" style={{ left: nowHeadLeft(cet.half, cet.slotProgress) }} aria-hidden />;
});

const OptBody = memo(function OptBody({
  year,
  monthIndex,
  showTables,
  dimPast,
  hidePastDays,
  focus,
  limits,
  capacity,
  grids,
  days,
  cet,
  todayRef,
  skin,
  busy,
}: {
  year: number;
  monthIndex: number;
  showTables: boolean;
  dimPast: boolean;
  hidePastDays?: boolean;
  skin?: "classic" | "theme";
  focus: string;
  limits: string[];
  capacity: CapacityMap;
  grids: Record<string, Occupancy>;
  days: { d: number; wd: string; weekend: boolean }[];
  cet: CetStamp;
  todayRef: RefObject<HTMLDivElement | null>;
  busy?: (string | null)[][];
}) {
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;
  const q = markQuery(focus);

  return (
    <>
      {days.map((day, dayIdx) => {
        const today = sameMonth && cet.day === day.d;
        if (hidePastDays && isPastDay(year, monthIndex, day.d, cet)) return null;
        const dayPast = dimPast && isPastSlot(year, monthIndex, day.d, 47, cet) && !today;
        return (
          <div
            key={day.d}
            ref={today ? todayRef : undefined}
            data-row={dayIdx}
            className={`v2-opt-block${today ? " is-today" : ""}${day.weekend ? " is-weekend" : ""}${dayPast ? " is-day-past" : ""}`}
          >
            <div className="v2-opt-day v2-mono">
              <b>{String(day.d).padStart(2, "0")}</b>
              <small>{day.wd}</small>
            </div>
            <div className="v2-opt-lanes">
              {today && <OptNowLine cet={cet} />}
              {limits.map((limit) => {
                const row = grids[limit]?.[dayIdx] ?? [];
                const limitHours = hoursOf(capacity, limit, day.d, weekdayOf(year, monthIndex, day.d));
                const levels = lanesOf(capacity, limit, day.d, year, monthIndex);
                const lanes = levels.map((level) => {
                  const lane = `${dayIdx}-${limit}-${level}`;
                  return (
                    <div key={lane} data-lane={lane} className="v2-opt-lane">
                      <div className="v2-opt-nl">
                        <span className="v2-limit-chip" style={{ color: limitTone(limit) }}>
                          {limit}
                          {levels.length > 1 ? `·${level + 1}` : ""}
                        </span>
                      </div>
                      <div className="v2-opt-track">
                        {Array.from({ length: SLOT_COUNT }, (_, half) => {
                          const locked = !levelAllowed(half, level, limitHours);
                          const mark = seatsOf(row[half], level + 1)[level];
                          const useMat = skin === "theme";
                          const past = dimPast && isPastSlot(year, monthIndex, day.d, half, cet);
                          const nowPct =
                            !useMat && dimPast && today && half === cet.half
                              ? Math.min(100, Math.max(0, cet.slotProgress * 100))
                              : undefined;
                          const focused = Boolean(q && mark && mark.t.toUpperCase() === q);
                          const other = busy?.[dayIdx]?.[half];
                          const busyLimit = other && other !== limit ? other : undefined;
                          return (
                            <OptCell
                              key={half}
                              dayIdx={dayIdx}
                              day={day.d}
                              half={half}
                              level={level}
                              limit={limit}
                              lane={lane}
                              tag={mark?.t}
                              tables={mark?.tables}
                              bg={mark?.bg}
                              fg={mark?.fg}
                              showTables={showTables}
                              past={past}
                              locked={locked}
                              muted={Boolean(q && mark && !focused)}
                              hit={focused}
                              nowPct={nowPct}
                              busyLimit={busyLimit}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                });
                if (skin !== "theme") return lanes;
                return (
                  <div key={limit} className="v2-opt-limit">
                    {busy
                      ? Array.from({ length: SLOT_COUNT }, (_, half) => {
                          const other = busy[dayIdx]?.[half];
                          if (!other || other === limit) return null;
                          return (
                            <span
                              key={half}
                              className="v2-opt-busy"
                              style={{ ["--busy-half" as string]: half } as CSSProperties}
                              aria-hidden
                            />
                          );
                        })
                      : null}
                    {lanes}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
});

const OptFoot = memo(function OptFoot({ cols }: { cols: number[] }) {
  const { t } = useTranslation();
  return (
    <section className="v2-opt-foot">
      <div className="v2-opt-foot-copy">
        <span>{t("v2.foot.kicker")}</span>
        <h3>{t("v2.foot.title")}</h3>
        <p>{t("v2.foot.lead")}</p>
      </div>
      <div className="v2-opt-foot-chart">
        <div className="v2-opt-fill-axis" aria-hidden>
          <b>100%</b>
          <span>50%</span>
          <small>0%</small>
        </div>
        <div className="v2-opt-fill-plot">
          <div className="v2-opt-track v2-opt-fill">
            {cols.map((pct, half) => (
              <span
                key={half}
                className="v2-opt-fill-col"
                style={{ ["--p" as string]: String(pct) }}
                title={`${slotSpan(half)} CET · ${pctLabel(pct)}`}
              >
                {half % 4 === 0 ? <em>{Math.round(pct * 100)}</em> : null}
              </span>
            ))}
          </div>
          <div className="v2-opt-track v2-opt-fill-hours" aria-hidden>
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} style={{ gridColumn: `${hour * 2 + 1} / span 2` }}>
                {hour}
              </span>
            ))}
          </div>
          <div className="v2-opt-fill-x">{t("v2.foot.cet")}</div>
        </div>
      </div>
      <div className="v2-opt-help">
        <div className="v2-opt-foot-copy">
          <span>{t("v2.help.kicker")}</span>
          <h3>{t("v2.help.title")}</h3>
          <p>{t("v2.help.lead")}</p>
        </div>
        <div className="v2-opt-help-grid">
          {(["edit", "place", "remove", "tables", "tip", "search", "settings", "cursor"] as const).map((key) => (
            <article key={key}>
              <b>{t(`v2.help.${key}.h`)}</b>
              <p>{t(`v2.help.${key}.p`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
});

function OptTip({
  year,
  monthIndex,
  grids,
  capacity,
  showTip,
  waitRef,
  skin,
}: {
  year: number;
  monthIndex: number;
  grids: Record<string, Occupancy>;
  capacity: CapacityMap;
  showTip: boolean;
  waitRef: MutableRefObject<{
    show: (hit: SlotHit) => void;
    hide: () => void;
  }>;
  skin?: "classic" | "theme";
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<SlotHit | null>(null);
  const mskOffset = playerHourOffset();

  useEffect(() => {
    waitRef.current = {
      hide: () => setHover(null),
      show: (hit) => {
        if (!showTip && !hit.busyLimit) {
          setHover(null);
          return;
        }
        setHover(hit);
      },
    };
  }, [showTip, waitRef]);

  if (!hover) return null;
  const hoursCaps = hoursOf(capacity, hover.limit, hover.day, weekdayOf(year, monthIndex, hover.day));
  const locked = !levelAllowed(hover.half, hover.level, hoursCaps);
  const mark = seatsOf(grids[hover.limit]?.[hover.dayIdx]?.[hover.half], hover.level + 1)[hover.level];
  const cap = hoursCaps[Math.floor(hover.half / 2)] ?? 1;

  return createPortal(
    <div className={`v2-opt-tip${skin === "theme" ? " is-kit" : ""}`} style={{ left: hover.x, top: hover.y }}>
      <div className="v2-opt-tip-when">
        <b>{tipDate(year, monthIndex, hover.day, i18n.language)}</b>
        <span>{slotSpan(hover.half)}</span>
        <small>
          {t("v2.tip.msk")} {slotSpan(hover.half, mskOffset)}
        </small>
      </div>
      {hover.busyLimit && hover.busyLimit !== hover.limit ? (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.busy", { limit: hover.busyLimit })}</strong>
          <p>{t("v2.tip.busyHint")}</p>
        </div>
      ) : locked ? (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.locked", { n: hover.level + 1 })}</strong>
          <p>{t("v2.tip.lockedHint", { cap, need: hover.level + 1 })}</p>
        </div>
      ) : mark ? (
        <div className="v2-opt-tip-who">
          <span className="v2-opt-cell is-on" style={{ ["--mark" as string]: mark.bg, ["--mark-ink" as string]: mark.fg }}>
            <span className="v2-opt-face has-n">
              <b>{mark.t}</b>
              <i>{mark.tables}</i>
            </span>
          </span>
          <div>
            <strong>{mark.discord}</strong>
            <em>{tablesLabel(mark.tables, i18n.language)}</em>
            <small>
              {mark.room}
              <span> · </span>
              NL {hover.limit}
            </small>
          </div>
        </div>
      ) : (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.empty")}</strong>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function OptField({
  year,
  monthIndex,
  me,
  showTables,
  dimPast,
  hidePastDays,
  showTip,
  canEdit,
  quietEdit,
  focus,
  limits,
  capacity,
  grids,
  hourLoad,
  onGridChange,
  skin = "classic",
  busy,
}: Props) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const propsRef = useRef({ year, monthIndex, me, capacity, grids, onGridChange, dimPast, canEdit, skin });
  propsRef.current = { year, monthIndex, me, capacity, grids, onGridChange, dimPast, canEdit, skin };
  const tipApi = useRef({ show: (_hit: SlotHit) => {}, hide: () => {} });
  const clickTimer = useRef(0);
  const [cet, setCet] = useState<CetStamp>(() => readCet());
  const daysRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), []);
  const mskOffset = playerHourOffset();
  const [slotLook, setSlotLook] = useState(() => loadSlotLook());
  const fillCols = useMemo(
    () => columnFill(grids, limits, capacity, year, monthIndex),
    [grids, limits, capacity, year, monthIndex],
  );

  useEffect(() => {
    const sync = () => setSlotLook(loadSlotLook());
    window.addEventListener(SLOT_LOOK_EVENT, sync);
    return () => window.removeEventListener(SLOT_LOOK_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => setCet(readCet());
    const wait = Math.max(250, (60 - readCet().second) * 1000);
    let interval = 0;
    const timeout = window.setTimeout(() => {
      sync();
      interval = window.setInterval(sync, 60_000);
    }, wait);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const host = daysRef.current?.querySelector(".v2-opt-frame-host");
    if (!host) return;
    const frame = document.createElement("div");
    frame.className = "v2-opt-frame";
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    host.appendChild(frame);
    return () => {
      frame.remove();
      const root = rootRef.current;
      if (!root) return;
      const mem = navMem.get(root);
      if (mem) mem.frame = null;
    };
  }, []);

  useLayoutEffect(() => {
    const now = readCet();
    if (now.year !== year || now.monthIndex !== monthIndex) return;
    const pinToday = () => {
      const scroller = daysRef.current;
      const header = rootRef.current?.querySelector(".v2-opt-hours") as HTMLElement | null;
      const row = todayRef.current;
      if (!scroller || !row || !header) return;
      const blocks = [...scroller.querySelectorAll<HTMLElement>(".v2-opt-block")];
      const idx = blocks.indexOf(row);
      if (idx < 0) return;
      const target = hidePastDays ? row : idx >= 2 ? blocks[idx - 2] : blocks[0];
      const delta = target.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      if (Math.abs(delta) > 0.5) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    };
    let alive = true;
    const run = () => {
      if (alive) pinToday();
    };
    const frame = requestAnimationFrame(run);
    const timers = [40, 120, 280, 600].map((ms) => window.setTimeout(run, ms));
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [year, monthIndex, days.length, limits, capacity, hidePastDays]);

  const applySeat = (hit: SlotHit, mode: "place" | "remove") => {
    const p = propsRef.current;
    if (!p.canEdit) return;
    const now = readCet();
    if (isPastSlot(p.year, p.monthIndex, hit.day, hit.half, now)) return;
    const hoursCaps = hoursOf(p.capacity, hit.limit, hit.day, weekdayOf(p.year, p.monthIndex, hit.day));
    if (!levelAllowed(hit.half, hit.level, hoursCaps)) return;
    const grid = p.grids[hit.limit];
    if (!grid) return;
    const cell = grid[hit.dayIdx]?.[hit.half];
    const seats = seatsOf(cell, hit.level + 1);
    const mine = seats.findIndex((seat) => seat?.t === p.me.t);
    if (mode === "place") {
      if (hit.busyLimit && hit.busyLimit !== hit.limit) return;
      if (seats[hit.level] || mine >= 0) return;
    } else if (mine !== hit.level) return;
    p.onGridChange(
      hit.limit,
      grid.map((row, r) =>
        row.map((item, c) =>
          r === hit.dayIdx && c === hit.half ? toggleSeat(item, p.me, hit.half, hit.level, hoursCaps) : item,
        ),
      ),
    );
  };

  const onClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    tipApi.current.hide();
    const root = rootRef.current;
    const hit = hitFromEvent(event.target, root, true);
    if (!hit) return;
    if (hit.busyLimit && hit.busyLimit !== hit.limit) {
      tipApi.current.show(hit);
      return;
    }
    if (event.detail > 1) return;
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => applySeat(hit, "place"), CLICK_WAIT);
  }, []);

  const onDoubleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    window.clearTimeout(clickTimer.current);
    const hit = hitFromEvent(event.target, rootRef.current);
    if (!hit) return;
    applySeat(hit, "remove");
  }, []);

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const hit = hitFromEvent(event.target, rootRef.current, true);
    if (!hit) {
      tipApi.current.hide();
      return;
    }
    tipApi.current.show(hit);
  }, []);

  const onPointerOver = useCallback((event: PointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const hit = hitFromEvent(event.target, root);
    if (!hit) {
      const inside = event.target instanceof Element && event.target.closest(".v2-opt-track, .v2-opt-block");
      if (!inside) applyNav(root, null);
      return;
    }
    applyNav(root, hit);
    if (
      root.classList.contains("is-kit") &&
      root.classList.contains("is-edit") &&
      hit.busyLimit &&
      hit.busyLimit !== hit.limit
    ) {
      const located = hitFromEvent(event.target, root, true);
      if (located) tipApi.current.show(located);
    } else if (root.classList.contains("is-kit") && root.classList.contains("is-edit")) {
      tipApi.current.hide();
    }
  }, []);

  const onPointerLeave = useCallback(() => {
    const root = rootRef.current;
    if (root) applyNav(root, null);
    if (root?.classList.contains("is-kit") && root.classList.contains("is-edit")) tipApi.current.hide();
  }, []);

  const loadWash = loadGradient(hourLoad?.[limits[0] ?? "50"]);

  return (
    <section
      ref={rootRef}
      className={`v2-opt flex min-h-0 flex-1 flex-col overflow-hidden${canEdit ? " is-edit" : ""}${quietEdit ? " is-quiet" : ""}${skin === "theme" ? " is-kit" : ""}`}
      style={
        {
          ["--opt-load" as string]: loadWash,
          ...(skin === "theme" ? {} : lookToVars(slotLook)),
        } as CSSProperties
      }
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
    >
      <div className="v2-opt-sheet">
        <div className="v2-opt-hours">
          <div className="v2-opt-day v2-opt-lab">{t("v2.day")}</div>
          <div className="v2-opt-nl v2-opt-lab">NL</div>
          <div className="v2-opt-track v2-opt-head v2-mono relative">
            {hours.map((h) => {
              const msk = (h + mskOffset) % 24;
              return (
                <span key={h} data-h={h} className="v2-opt-hour" style={{ gridColumn: `${h * 2 + 1} / span 2` }}>
                  <b>
                    {h}–{h + 1}
                  </b>
                  <small title="MSK">
                    {msk}–{msk + 1 > 24 ? 24 : msk + 1}
                  </small>
                </span>
              );
            })}
            <OptHeadNow cet={cet} />
          </div>
        </div>
        <div ref={daysRef} className="v2-days min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="v2-days-inner">
            <OptBody
              year={year}
              monthIndex={monthIndex}
              showTables={showTables}
              dimPast={dimPast}
              hidePastDays={hidePastDays}
              focus={focus}
              limits={limits}
              capacity={capacity}
              grids={grids}
              days={days}
              cet={cet}
              todayRef={todayRef}
              skin={skin}
              busy={busy}
            />
            {hidePastDays && days.every((day) => isPastDay(year, monthIndex, day.d, cet)) && (
              <p className="v2-opt-empty-days">{t("schedule.hidePastEmpty")}</p>
            )}
            <OptFoot cols={fillCols} />
            <div className="v2-opt-frame-host" aria-hidden />
          </div>
        </div>
      </div>
      <OptTip
        year={year}
        monthIndex={monthIndex}
        grids={grids}
        capacity={capacity}
        showTip={showTip}
        waitRef={tipApi}
        skin={skin}
      />
    </section>
  );
}
