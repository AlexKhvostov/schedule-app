import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type MutableRefObject, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { isPastDay, isPastSlot, readCet, type CetStamp } from "../schedule/cet";
import { isSelfSeat, type Mark } from "../schedule/marks";
import { hoursOf, lanesForDay, formatLimit, limitTone, weekdayOf, type CapacityMap } from "../schedule/capacity";
import { formatDayLabel } from "../schedule/formatDate";
import { daysInMonth, levelAllowed, seatsOf, shownLevels, type Occupancy } from "../schedule/plan";
import { loadGradient, type HourLoadMap } from "../schedule/hourLoad";
import { lookToVars, loadSlotLook, SLOT_LOOK_EVENT } from "../schedule/slotLook";
import { loadTheme, type UiTheme } from "./theme";
import { usePlayerClock } from "./usePlayerClock";
import { MarkFace } from "./ScheduleSlot";
import { OptLevelLane, OptNlChip } from "./OptLevelLane";

type Props = {
  year: number;
  monthIndex: number;
  me: Mark;
  self?: Mark;
  showTables: boolean;
  countTables?: boolean;
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
  busy?: (string[] | null)[][];
  canRemoveForeign?: boolean;
  onOverwriteAsk?: (ask: OverwriteAsk) => void;
  onForeignKept?: () => void;
};

export type OverwriteSlot = { date: string; half: number; level: number };

export type OverwritePerson = {
  key: string;
  memberId?: string;
  tag: string;
  bg: string;
  fg: string;
  avatarUrl?: string;
  discord: string;
  username?: string;
  room: string;
  slots: OverwriteSlot[];
};

export type OverwriteAsk = {
  kind: "remove" | "place";
  limit: string;
  people: OverwritePerson[];
  memberIds: string[];
  slots: OverwriteSlot[];
  next: Occupancy;
  empty?: Occupancy;
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
  busyLimits?: string[];
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
const TIP_SLACK = 12;

type TipPoint = { x: number; y: number };
type TipApi = {
  show: (hit: SlotHit, rest?: TipPoint, force?: boolean) => void;
  hide: () => void;
};

function slotSpan(half: number, hourShift = 0) {
  const start = (Math.floor(half / 2) * 60 + (half % 2 ? 30 : 0) + hourShift * 60 + 24 * 60) % (24 * 60);
  const end = (start + 30) % (24 * 60);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function tipDate(year: number, monthIndex: number, day: number, lang: string) {
  return formatDayLabel(year, monthIndex, day, lang);
}

function tablesLabel(count: number, lang: string) {
  if (lang.startsWith("en")) return count === 1 ? "1 table" : `${count} tables`;
  const ten = count % 10;
  const hundred = count % 100;
  if (ten === 1 && hundred !== 11) return `${count} стол`;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${count} стола`;
  return `${count} столов`;
}

function isClubCode(value?: string | null) {
  return Boolean(value && /^RP-[0-9A-Fa-f]{6}$/i.test(value.trim()));
}

function displayNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "—";
  return text;
}

function showNick(value?: string | null) {
  const text = value?.trim() ?? "";
  if (!text || isClubCode(text)) return "";
  return text;
}

function ownerKey(mark: Mark) {
  return mark.memberId || mark.discord || mark.t || "mark";
}

function writeSeat(item: Occupancy[number][number] | undefined, level: number, next: Mark | null) {
  const seats = seatsOf(item, Math.max(level + 1, 2));
  const out = seats.slice();
  out[level] = next;
  return out;
}

function packOwner(mark: Mark): Omit<OverwritePerson, "slots"> {
  const discord = showNick(mark.discord) || showNick(mark.guildNick) || showNick(mark.globalName) || showNick(mark.username) || mark.t.trim() || "—";
  const username = showNick(mark.username);
  const room = showNick(mark.room);
  return {
    key: ownerKey(mark),
    memberId: mark.memberId,
    tag: mark.t,
    bg: mark.bg,
    fg: mark.fg,
    avatarUrl: mark.avatarUrl,
    discord,
    username: username && username.toLowerCase() !== discord.replace(/^@/, "").toLowerCase() ? username : "",
    room,
  };
}

function markQuery(focus: string) {
  return focus.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function findHitCss(q: string) {
  if (!q) return "";
  return `.v2-opt.is-find[data-opt-find="${q}"] .v2-opt-cell.is-on[data-mark="${q}"]{z-index:8;opacity:1;outline:1.5px solid var(--ring);outline-offset:0;animation:v2-chip-pulse 1.1s ease-in-out infinite}`;
}

function nowAlongTrack(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `var(--opt-pad-l) + (100% - var(--opt-pad-l) - var(--opt-pad-r) - 47 * var(--opt-gap)) * ${cell + frac} / ${SLOT_COUNT} + ${cell} * var(--opt-gap)`;
}

function nowHeadLeft(half: number, progress: number) {
  const t = Math.min(SLOT_COUNT, Math.max(0, half + Math.min(1, Math.max(0, progress))));
  const cell = Math.min(SLOT_COUNT - 1, Math.floor(t));
  const frac = t - cell;
  return `calc(var(--opt-pad-l) + (100% - var(--opt-pad-l) - var(--opt-pad-r) - 47 * var(--opt-gap)) * ${cell + frac} / ${SLOT_COUNT} + ${cell} * var(--opt-gap))`;
}

function nowLineLeft(half: number, progress: number) {
  return `calc(${nowAlongTrack(half, progress)})`;
}

function levelsOf(
  capacity: CapacityMap,
  limit: string,
  day: number,
  year: number,
  monthIndex: number,
  dayRow?: Occupancy[number],
) {
  const hours = hoursOf(capacity, limit, day, weekdayOf(year, monthIndex, day));
  return {
    hours,
    levels: shownLevels(lanesForDay(capacity, limit, day, year, monthIndex), hours, dayRow),
  };
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
    if (x + 252 > window.innerWidth - 8) x = Math.max(8, box.left - 260);
    if (y + 156 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 164);
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
    busyLimits: (el.dataset.busy || "").split(",").filter(Boolean),
    x,
    y,
  };
}

function laneCells(origin: SlotHit) {
  const track = origin.cell.closest(".v2-opt-track");
  if (!track) return [] as HTMLElement[];
  return [...track.querySelectorAll<HTMLElement>("[data-slot]")];
}

function halfOnLane(origin: SlotHit, clientX: number) {
  const cells = laneCells(origin);
  if (!cells.length) return origin.half;
  let best = origin.half;
  let bestDist = Infinity;
  for (const el of cells) {
    const box = el.getBoundingClientRect();
    if (clientX >= box.left && clientX <= box.right) return Number(el.dataset.half);
    const mid = (box.left + box.right) / 2;
    const dist = Math.abs(clientX - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = Number(el.dataset.half);
    }
  }
  return best;
}

function hitOnLane(origin: SlotHit, half: number): SlotHit | null {
  const el = laneCells(origin).find((cell) => Number(cell.dataset.half) === half);
  if (!el) return null;
  return {
    ...origin,
    cell: el,
    half,
    hour: Number(el.dataset.h),
  };
}

function showPick(origin: SlotHit, fromHalf: number, toHalf: number, mode: "place" | "remove") {
  const track = origin.cell.closest(".v2-opt-track");
  if (!(track instanceof HTMLElement)) return;
  let pick = track.querySelector<HTMLElement>(".v2-opt-pick");
  if (!pick) {
    pick = document.createElement("div");
    pick.className = "v2-opt-pick";
    pick.setAttribute("aria-hidden", "true");
    track.appendChild(pick);
  }
  const a = Math.min(fromHalf, toHalf);
  const b = Math.max(fromHalf, toHalf);
  const cells = laneCells(origin).filter((el) => {
    const half = Number(el.dataset.half);
    return half >= a && half <= b;
  });
  if (!cells.length) {
    pick.hidden = true;
    return;
  }
  const trackBox = track.getBoundingClientRect();
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
  const pad = 2;
  pick.style.left = `${left - trackBox.left - pad}px`;
  pick.style.top = `${top - trackBox.top - pad}px`;
  pick.style.width = `${right - left + pad * 2}px`;
  pick.style.height = `${bottom - top + pad * 2}px`;
  pick.classList.toggle("is-off", mode === "remove");
  pick.hidden = false;
}

function hidePick(root?: HTMLElement | null) {
  const scope = root ?? document;
  scope.querySelectorAll(".v2-opt-pick").forEach((el) => el.remove());
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

function OptFace({ tag, tables, showTables, on }: { tag?: string; tables?: number; showTables: boolean; on?: boolean }) {
  if (!on) return null;
  return <MarkFace letters={tag?.trim() || "—"} tables={tables} showTables={showTables} />;
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
  busyLimits,
  busyHalf,
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
  muted?: boolean;
  hit?: boolean;
  nowPct?: number;
  busyLimits?: string[];
  busyHalf?: boolean;
}) {
  const on = Boolean(bg);
  const mark = tag?.trim().toUpperCase() || undefined;
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
      data-mark={mark}
      data-busy={busyLimits?.length ? busyLimits.join(",") : undefined}
      className={`v2-opt-cell${past ? " is-past" : ""}${locked ? " is-lock" : ""}${on ? " is-on" : ""}${muted ? " is-dim" : ""}${hit ? " is-hit" : ""}${nowPct != null ? " is-now" : ""}${busyHalf ? " is-busy" : ""}`}
      style={
        {
          "--mark": bg,
          "--mark-ink": fg,
          "--opt-now-pct": nowPct != null ? `${nowPct}%` : undefined,
        } as CSSProperties
      }
    >
      <OptFace tag={tag} tables={tables} showTables={showTables} on={on} />
      {nowPct != null && (
        <span className="v2-opt-now-dim" aria-hidden>
          <OptFace tag={tag} tables={tables} showTables={showTables} on={on} />
        </span>
      )}
    </div>
  );
});

const OptNowLine = memo(function OptNowLine() {
  return <span className="v2-opt-now" aria-hidden />;
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
  limits: string[];
  capacity: CapacityMap;
  grids: Record<string, Occupancy>;
  days: { d: number; wd: string; weekend: boolean }[];
  cet: CetStamp;
  todayRef: RefObject<HTMLDivElement | null>;
  busy?: (string[] | null)[][];
}) {
  const sameMonth = cet.year === year && cet.monthIndex === monthIndex;

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
            className={`v2-opt-block${today ? " is-today" : ""}${day.weekend ? " is-weekend" : ""}${dayPast ? " is-day-past" : ""}${today && dimPast ? " is-now-cut" : ""}`}
            style={today ? ({ ["--opt-now"]: nowLineLeft(cet.half, cet.slotProgress) } as CSSProperties) : undefined}
          >
            <div className="v2-opt-gutter">
              <div className="v2-opt-day v2-mono">
                <b>{String(day.d).padStart(2, "0")}</b>
                <small>{day.wd}</small>
              </div>
              <div className="v2-opt-gutter-nls">
                {limits.map((limit) => {
                  const { levels } = levelsOf(capacity, limit, day.d, year, monthIndex, grids[limit]?.[dayIdx]);
                  const named = levels.filter((row) => !row.ghost).length;
                  const chips = levels.map(({ level, ghost }) => (
                    <OptNlChip
                      key={`${dayIdx}-${limit}-${level}`}
                      tone={limitTone(limit)}
                      ghost={ghost}
                      label={`${limit}${named > 1 ? `·${level + 1}` : ""}`}
                    />
                  ));
                  if (skin !== "theme") return chips;
                  return (
                    <div key={limit} className="v2-opt-gutter-limit">
                      {chips}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="v2-opt-lanes">
              {today && <OptNowLine />}
              {limits.map((limit) => {
                const row = grids[limit]?.[dayIdx] ?? [];
                const { hours: limitHours, levels } = levelsOf(capacity, limit, day.d, year, monthIndex, row);
                const named = levels.filter((item) => !item.ghost).length;
                const lanes = levels.map(({ level, ghost }) => {
                  const lane = `${dayIdx}-${limit}-${level}`;
                  return (
                    <OptLevelLane
                      key={lane}
                      laneKey={lane}
                      showNl={false}
                      ghost={ghost}
                      tone={limitTone(limit)}
                      label={`${limit}${named > 1 ? `·${level + 1}` : ""}`}
                    >
                        {ghost
                          ? null
                          : Array.from({ length: SLOT_COUNT }, (_, half) => {
                          const locked = !levelAllowed(half, level, limitHours);
                          const mark = seatsOf(row[half], level + 1)[level];
                          const useMat = skin === "theme";
                          const gone = isPastSlot(year, monthIndex, day.d, half, cet);
                          const past = dimPast && gone;
                          const nowPct =
                            !useMat && dimPast && today && half === cet.half
                              ? Math.min(100, Math.max(0, cet.slotProgress * 100))
                              : undefined;
                          const mine = gone || locked ? undefined : busy?.[dayIdx]?.[half];
                          const hidden = mine?.filter((item) => !limits.includes(item));
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
                              nowPct={nowPct}
                              busyLimits={hidden}
                              busyHalf={Boolean(hidden?.length)}
                            />
                          );
                        })}
                    </OptLevelLane>
                  );
                });
                if (skin !== "theme") return lanes;
                return (
                  <div key={limit} className="v2-opt-limit">
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

const HELP_GROUPS = [
  { id: "marks", items: ["edit", "place", "remove", "tables"] as const },
  { id: "read", items: ["cursor", "tip"] as const },
  { id: "screen", items: ["search", "settings"] as const },
];

const OptHelp = memo(function OptHelp({ countTables = false }: { countTables?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className={`v2-opt-help${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="v2-opt-help-toggle"
        aria-expanded={open}
        aria-controls="v2-opt-help-body"
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fa-regular fa-circle-question" aria-hidden />
        <span>{t("v2.help.title")}</span>
        <i className={`fa-solid fa-angle-down${open ? " is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="v2-opt-help-body" id="v2-opt-help-body">
          <p className="v2-opt-help-lead">{t("v2.help.lead")}</p>
          <div className="v2-opt-help-groups">
            {HELP_GROUPS.map((group) => (
              <article key={group.id} className="v2-opt-help-card">
                <h4>{t(`v2.help.groups.${group.id}`)}</h4>
                {group.items
                  .filter((key) => countTables || key !== "tables")
                  .map((key) => (
                  <div key={key} className="v2-opt-help-item">
                    <b>{t(`v2.help.${key}.h`)}</b>
                    <p>{t(`v2.help.${key}.p`)}</p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
});

function OptTip({
  year,
  monthIndex,
  grids,
  capacity,
  showTip,
  countTables = false,
  waitRef,
  skin,
}: {
  year: number;
  monthIndex: number;
  grids: Record<string, Occupancy>;
  capacity: CapacityMap;
  showTip: boolean;
  countTables?: boolean;
  waitRef: MutableRefObject<TipApi>;
  skin?: "classic" | "theme";
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<SlotHit | null>(null);
  const [theme, setTheme] = useState<UiTheme>(() => (typeof window === "undefined" ? "dark" : loadTheme()));
  const nodeRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<TipPoint | null>(null);
  const clock = usePlayerClock();

  useEffect(() => {
    const sync = () => setTheme(loadTheme());
    window.addEventListener("v2-theme", sync);
    return () => window.removeEventListener("v2-theme", sync);
  }, []);

  useEffect(() => {
    waitRef.current = {
      hide: () => {
        restRef.current = null;
        setHover(null);
      },
      show: (hit, rest, force) => {
        if (!showTip && !hit.busyLimits?.length && !force) {
          restRef.current = null;
          setHover(null);
          return;
        }
        restRef.current = rest ?? null;
        setHover(hit);
      },
    };
  }, [showTip, waitRef]);

  useEffect(() => {
    if (!hover) return;
    const hide = () => {
      restRef.current = null;
      setHover(null);
    };
    let armed = false;
    const arm = window.requestAnimationFrame(() => {
      armed = true;
    });
    const onMove = (event: globalThis.PointerEvent) => {
      if (!armed) return;
      const rest = restRef.current;
      if (!rest) return;
      const dx = event.clientX - rest.x;
      const dy = event.clientY - rest.y;
      if (dx * dx + dy * dy >= TIP_SLACK * TIP_SLACK) hide();
    };
    const capture = { capture: true } as const;
    const quiet = { capture: true, passive: true } as const;
    window.addEventListener("pointermove", onMove, quiet);
    window.addEventListener("pointerdown", hide, capture);
    window.addEventListener("wheel", hide, quiet);
    window.addEventListener("keydown", hide, capture);
    window.addEventListener("blur", hide);
    document.addEventListener("scroll", hide, quiet);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.cancelAnimationFrame(arm);
      window.removeEventListener("pointermove", onMove, quiet);
      window.removeEventListener("pointerdown", hide, capture);
      window.removeEventListener("wheel", hide, quiet);
      window.removeEventListener("keydown", hide, capture);
      window.removeEventListener("blur", hide);
      document.removeEventListener("scroll", hide, quiet);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hover]);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const pad = 8;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    let left = Number.parseFloat(node.style.left) || 0;
    let top = Number.parseFloat(node.style.top) || 0;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    if (top + height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - height - pad);
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }, [hover]);

  if (!hover) return null;
  const hoursCaps = hoursOf(capacity, hover.limit, hover.day, weekdayOf(year, monthIndex, hover.day));
  const locked = !levelAllowed(hover.half, hover.level, hoursCaps);
  const mark = seatsOf(grids[hover.limit]?.[hover.dayIdx]?.[hover.half], hover.level + 1)[hover.level];
  const cap = hoursCaps[Math.floor(hover.half / 2)] ?? 1;

  return createPortal(
    <div
      ref={nodeRef}
      className={`v2-opt-tip theme-${theme}${skin === "theme" ? " is-kit" : ""}`}
      style={{ left: hover.x, top: hover.y }}
    >
      <div className="v2-opt-tip-when">
        <b>{tipDate(year, monthIndex, hover.day, i18n.language)}</b>
        <span>
          {slotSpan(hover.half)}{" "}
          <i>{t("v2.tip.cet")}</i>
        </span>
        {clock.showLocal ? (
          <small>
            {slotSpan(hover.half, clock.offset)}{" "}
            <i>{clock.label}</i>
          </small>
        ) : null}
      </div>
      {hover.busyLimits?.length ? (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.busy", { limit: hover.busyLimits.map((item) => formatLimit(item)).join(", ") })}</strong>
          <p>{t("v2.tip.busyHint")}</p>
        </div>
      ) : mark ? (
        <div className="v2-opt-tip-who">
          <span className="v2-opt-tip-mark" style={{ ["--mark" as string]: mark.bg, ["--mark-ink" as string]: mark.fg }}>
            {mark.t.trim() || "—"}
          </span>
          <dl className="v2-opt-tip-facts">
            <div>
              <dt>{t("v2.tip.discord")}</dt>
              <dd>{displayNick(mark.discord)}</dd>
            </div>
            <div>
              <dt>{t("v2.tip.winamax")}</dt>
              <dd>{displayNick(mark.room)}</dd>
            </div>
            {countTables ? (
              <div>
                <dt>{t("v2.tip.tables")}</dt>
                <dd>{tablesLabel(mark.tables, i18n.language)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : locked ? (
        <div className="v2-opt-tip-note">
          <strong>{t("v2.tip.locked", { n: hover.level + 1 })}</strong>
          <p>{t("v2.tip.lockedHint", { cap, need: hover.level + 1 })}</p>
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

export const OptField = memo(function OptField({
  year,
  monthIndex,
  me,
  self,
  showTables,
  countTables = false,
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
  canRemoveForeign = false,
  onOverwriteAsk,
  onForeignKept,
}: Props) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const propsRef = useRef({
    year,
    monthIndex,
    me,
    self,
    capacity,
    grids,
    onGridChange,
    dimPast,
    canEdit,
    skin,
    busy,
    canRemoveForeign,
    onOverwriteAsk,
    onForeignKept,
  });
  propsRef.current = {
    year,
    monthIndex,
    me,
    self,
    capacity,
    grids,
    onGridChange,
    dimPast,
    canEdit,
    skin,
    busy,
    canRemoveForeign,
    onOverwriteAsk,
    onForeignKept,
  };
  const dragRef = useRef<{
    pointerId: number;
    mode: "place" | "remove" | "look";
    origin: SlotHit;
    endHalf: number;
    x: number;
    y: number;
    panned: boolean;
    foreign: boolean;
  } | null>(null);
  const tipApi = useRef<TipApi>({ show: () => {}, hide: () => {} });
  const [cet, setCet] = useState<CetStamp>(() => readCet());
  const daysRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const days = useMemo(
    () => daysInMonth(year, monthIndex, i18n.language),
    [year, monthIndex, i18n.language],
  );
  const hours = useMemo(() => Array.from({ length: 24 }, (_, hour) => hour), []);
  const clock = usePlayerClock();
  const [slotLook, setSlotLook] = useState(() => loadSlotLook());

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
      const nowLine = scroller.querySelector<HTMLElement>(".v2-opt-now");
      if (nowLine && scroller.scrollWidth > scroller.clientWidth + 8) {
        const mid = scroller.clientWidth * 0.42;
        const dx = nowLine.getBoundingClientRect().left - scroller.getBoundingClientRect().left - mid;
        scroller.scrollLeft = Math.max(0, scroller.scrollLeft + dx);
      }
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

  const applyRange = (origin: SlotHit, endHalf: number, mode: "place" | "remove") => {
    const p = propsRef.current;
    if (!p.canEdit) return;
    const now = readCet();
    const grid = p.grids[origin.limit];
    if (!grid?.[origin.dayIdx]) return;
    const hoursCaps = hoursOf(p.capacity, origin.limit, origin.day, weekdayOf(p.year, p.monthIndex, origin.day));
    const from = Math.min(origin.half, endHalf);
    const to = Math.max(origin.half, endHalf);
    const self = p.self ?? p.me;
    const brush = p.me;
    const brushIsSelf = isSelfSeat(brush, self);
    const canForeign = Boolean(p.canRemoveForeign);
    const date = `${p.year}-${String(p.monthIndex + 1).padStart(2, "0")}-${String(origin.day).padStart(2, "0")}`;

    const walk = (wipeForeign: boolean) => {
      const displaced = new Map<string, OverwritePerson>();
      const memberIds = new Set<string>();
      const slots: OverwriteAsk["slots"] = [];
      let changed = false;
      let keptForeign = false;
      const nextRow = grid[origin.dayIdx].map((item, half) => {
        if (half < from || half > to) return item;
        if (isPastSlot(p.year, p.monthIndex, origin.day, half, now)) return item;
        if (!levelAllowed(half, origin.level, hoursCaps) && mode === "place") return item;
        const before = seatsOf(item, origin.level + 1)[origin.level];
        if (mode === "remove") {
          if (!before) return item;
          if (isSelfSeat(before, self)) {
            changed = true;
            return writeSeat(item, origin.level, null);
          }
          if (wipeForeign && canForeign) {
            const slot = { date, half, level: origin.level };
            slots.push(slot);
            const owner = packOwner(before);
            const prev = displaced.get(owner.key);
            if (prev) prev.slots.push(slot);
            else displaced.set(owner.key, { ...owner, slots: [slot] });
            if (before.memberId) memberIds.add(before.memberId);
            changed = true;
            return writeSeat(item, origin.level, null);
          }
          keptForeign = true;
          return item;
        }
        if (!before) {
          changed = true;
          return writeSeat(item, origin.level, { ...brush });
        }
        if (isSelfSeat(before, self)) return item;
        if (wipeForeign && canForeign && brushIsSelf) {
          const slot = { date, half, level: origin.level };
          slots.push(slot);
          const owner = packOwner(before);
          const prev = displaced.get(owner.key);
          if (prev) prev.slots.push(slot);
          else displaced.set(owner.key, { ...owner, slots: [slot] });
          if (before.memberId) memberIds.add(before.memberId);
          changed = true;
          return writeSeat(item, origin.level, { ...brush });
        }
        keptForeign = true;
        return item;
      });
      const next = changed ? grid.map((row, r) => (r === origin.dayIdx ? nextRow : row)) : grid;
      return { next, displaced, memberIds, slots, changed, keptForeign };
    };

    const emptyPass = walk(false);
    const wipePass = walk(true);

    if (mode === "place" && !brushIsSelf) {
      if (emptyPass.changed) p.onGridChange(origin.limit, emptyPass.next);
      if (emptyPass.keptForeign) p.onForeignKept?.();
      return;
    }

    if (mode === "place") {
      if (!wipePass.displaced.size) {
        if (emptyPass.changed) p.onGridChange(origin.limit, emptyPass.next);
        return;
      }
      if (!canForeign) {
        if (emptyPass.changed) p.onGridChange(origin.limit, emptyPass.next);
        p.onForeignKept?.();
        return;
      }
      p.onOverwriteAsk?.({
        kind: "place",
        limit: origin.limit,
        people: [...wipePass.displaced.values()],
        memberIds: [...wipePass.memberIds],
        slots: wipePass.slots,
        next: wipePass.next,
        empty: emptyPass.changed ? emptyPass.next : undefined,
      });
      return;
    }

    if (!wipePass.displaced.size) {
      if (emptyPass.changed) p.onGridChange(origin.limit, emptyPass.next);
      return;
    }
    if (!canForeign) {
      if (emptyPass.changed) p.onGridChange(origin.limit, emptyPass.next);
      p.onForeignKept?.();
      return;
    }
    p.onOverwriteAsk?.({
      kind: "remove",
      limit: origin.limit,
      people: [...wipePass.displaced.values()],
      memberIds: [...wipePass.memberIds],
      slots: wipePass.slots,
      next: wipePass.next,
      empty: emptyPass.changed ? emptyPass.next : undefined,
    });
  };

  const inspectHit = (hit: SlotHit, rest: TipPoint) => {
    const p = propsRef.current;
    const hoursCaps = hoursOf(p.capacity, hit.limit, hit.day, weekdayOf(p.year, p.monthIndex, hit.day));
    const locked = !levelAllowed(hit.half, hit.level, hoursCaps);
    const mark = seatsOf(p.grids[hit.limit]?.[hit.dayIdx]?.[hit.half], hit.level + 1)[hit.level];
    if (hit.busyLimits?.length) {
      tipApi.current.show(hit, rest);
      return;
    }
    if (mark || locked) tipApi.current.show(hit, rest);
  };

  const endDrag = (event: PointerEvent<HTMLElement>, apply: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    hidePick(rootRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!apply) return;
    if (drag.mode === "look") {
      if (!drag.panned) inspectHit(drag.origin, { x: event.clientX, y: event.clientY });
      return;
    }
    applyRange(drag.origin, drag.endHalf, drag.mode);
  };

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const root = rootRef.current;
    const hit = hitFromEvent(event.target, root, true);
    if (!hit) return;
    tipApi.current.hide();
    const p = propsRef.current;
    const now = readCet();
    const past = isPastSlot(p.year, p.monthIndex, hit.day, hit.half, now);
    const hoursCaps = hoursOf(p.capacity, hit.limit, hit.day, weekdayOf(p.year, p.monthIndex, hit.day));
    const locked = !levelAllowed(hit.half, hit.level, hoursCaps);
    const seats = seatsOf(p.grids[hit.limit]?.[hit.dayIdx]?.[hit.half], hit.level + 1);
    const mark = seats[hit.level];
    const own = isSelfSeat(mark, p.self ?? p.me);
    let mode: "place" | "remove" | "look" = "look";
    if (p.canEdit && !past) {
      if (own) mode = "remove";
      else if (mark && p.canRemoveForeign) mode = "remove";
      else if (!mark && !locked) mode = "place";
    }
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      origin: hit,
      endHalf: hit.half,
      x: event.clientX,
      y: event.clientY,
      panned: false,
      foreign: Boolean(mark && !own),
    };
    if (mode === "look") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    showPick(hit, hit.half, hit.half, mode);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode === "look") {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.panned = true;
      return;
    }
    const endHalf = halfOnLane(drag.origin, event.clientX);
    if (endHalf === drag.endHalf) return;
    drag.endHalf = endHalf;
    const root = rootRef.current;
    if (root) {
      const cursor = hitOnLane(drag.origin, endHalf);
      if (cursor) applyNav(root, cursor);
    }
    showPick(drag.origin, drag.origin.half, endHalf, drag.mode);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    endDrag(event, true);
  }, []);

  const onPointerCancel = useCallback((event: PointerEvent<HTMLElement>) => {
    endDrag(event, false);
  }, []);

  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const hit = hitFromEvent(event.target, rootRef.current, true);
    if (!hit) {
      tipApi.current.hide();
      return;
    }
    tipApi.current.show(
      hit,
      { x: event.clientX, y: event.clientY },
      propsRef.current.canRemoveForeign,
    );
  }, []);

  const onPointerOver = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragRef.current && dragRef.current.mode !== "look") return;
    const root = rootRef.current;
    if (!root) return;
    const hit = hitFromEvent(event.target, root);
    if (!hit) {
      const inside = event.target instanceof Element && event.target.closest(".v2-opt-track, .v2-opt-block");
      if (!inside) applyNav(root, null);
      return;
    }
    applyNav(root, hit);
    if (hit.busyLimits?.length) {
      tipApi.current.show({ ...hit, x: event.clientX + 12, y: event.clientY + 10 });
    } else {
      tipApi.current.hide();
    }
  }, []);

  const onPointerLeave = useCallback(() => {
    if (dragRef.current && dragRef.current.mode !== "look") return;
    const root = rootRef.current;
    if (root) applyNav(root, null);
    tipApi.current.hide();
  }, []);

  const loadWash = loadGradient(hourLoad?.[limits[0] ?? "50"]);
  const q = markQuery(focus);

  return (
    <section
      ref={rootRef}
      className={`v2-opt flex min-h-0 flex-1 flex-col overflow-hidden${canEdit ? " is-edit" : ""}${quietEdit ? " is-quiet" : ""}${skin === "theme" ? " is-kit" : ""}${q ? " is-find" : ""}`}
      data-opt-find={q || undefined}
      style={
        {
          ["--opt-load" as string]: loadWash,
          ["--busy-mark" as string]: me.bg || undefined,
          ...(skin === "theme" ? {} : lookToVars(slotLook)),
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
    >
      {q ? <style>{findHitCss(q)}</style> : null}
      <div className="v2-opt-sheet" ref={daysRef}>
        <div className="v2-opt-board">
        <div className="v2-opt-hours">
          <div className="v2-opt-gutter">
            <div className="v2-opt-day v2-opt-lab">{t("v2.day")}</div>
            <div className="v2-opt-gutter-nls">
              <div className="v2-opt-nl v2-opt-lab">NL</div>
            </div>
          </div>
          <div className="v2-opt-lanes">
            <div className="v2-opt-lane">
              <div className="v2-opt-track v2-opt-head v2-mono relative">
                {hours.map((h) => {
                  const local = (h + clock.offset) % 24;
                  return (
                    <span key={h} data-h={h} className="v2-opt-hour" style={{ gridColumn: `${h * 2 + 1} / span 2` }}>
                      <b>
                        {h}–{h + 1}
                      </b>
                      {clock.showLocal ? (
                        <small title={clock.label}>
                          {local}–{local + 1 > 24 ? 24 : local + 1}
                        </small>
                      ) : null}
                    </span>
                  );
                })}
                <OptHeadNow cet={cet} />
              </div>
            </div>
          </div>
        </div>
        <div className="v2-days">
          <div className="v2-days-inner">
            <OptBody
              year={year}
              monthIndex={monthIndex}
              showTables={showTables}
              dimPast={dimPast}
              hidePastDays={hidePastDays}
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
            <div className="v2-opt-frame-host" aria-hidden />
          </div>
        </div>
        </div>
        <OptHelp countTables={countTables} />
      </div>
      <OptTip
        year={year}
        monthIndex={monthIndex}
        grids={grids}
        capacity={capacity}
        showTip={showTip}
        countTables={countTables}
        waitRef={tipApi}
        skin={skin}
      />
    </section>
  );
});
