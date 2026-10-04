import {
  slotRangeSpan
} from "../optFieldModel";
import { type SlotHit } from "./types";

type NavMem = {
  block: Element | null;
  hour: HTMLElement | null;
  lane: Element | null;
  cell: HTMLElement | null;
  merged: HTMLElement | null;
  hours: Element | null;
  frame: HTMLDivElement | null;
  col: string;
};

export const navMem = new WeakMap<HTMLElement, NavMem>();

export function hitFromEvent(target: EventTarget | null, root: HTMLElement | null, withPos = false): SlotHit | null {
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
    variant: el.dataset.variant === "regular" ? "regular" : "nitro",
    limit: el.dataset.limit ?? "",
    lane: el.dataset.lane ?? "",
    busyPairs: (el.dataset.busy || "").split(",").flatMap((value) => {
      const [variant, limit] = value.split(":", 2);
      return (variant === "nitro" || variant === "regular") && limit ? [{ variant, limit }] : [];
    }),
    rangeStartHalf: el.dataset.rangeStartHalf ? Number(el.dataset.rangeStartHalf) : undefined,
    rangeEndHalf: el.dataset.rangeEndHalf ? Number(el.dataset.rangeEndHalf) : undefined,
    mergedStartHalf: el.dataset.mergedStartHalf ? Number(el.dataset.mergedStartHalf) : undefined,
    mergedEndHalf: el.dataset.mergedEndHalf ? Number(el.dataset.mergedEndHalf) : undefined,
    x,
    y,
  };
}

function laneCells(origin: SlotHit) {
  const track = origin.cell.closest(".v2-opt-track");
  if (!track) return [] as HTMLElement[];
  return [...track.querySelectorAll<HTMLElement>("[data-slot]")];
}

export function halfOnLane(origin: SlotHit, clientX: number) {
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

export function hitOnLane(origin: SlotHit, half: number): SlotHit | null {
  const el = laneCells(origin).find((cell) => Number(cell.dataset.half) === half);
  if (!el) return null;
  return {
    ...origin,
    cell: el,
    half,
    hour: Number(el.dataset.h),
  };
}

export function showPick(origin: SlotHit, fromHalf: number, toHalf: number, mode: "place" | "remove") {
  const track = origin.cell.closest(".v2-opt-track");
  if (!(track instanceof HTMLElement)) return;
  let pick = track.querySelector<HTMLElement>(".v2-opt-pick");
  if (!pick) {
    pick = document.createElement("div");
    pick.className = "v2-opt-pick";
    pick.setAttribute("aria-hidden", "true");
    track.appendChild(pick);
  }
  track.closest(".v2-opt-block")?.classList.add("is-picking");
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
  pick.dataset.label = slotRangeSpan(a, b);
  pick.classList.toggle("is-off", mode === "remove");
  pick.hidden = false;
}

export function hidePick(root?: HTMLElement | null) {
  const scope = root ?? document;
  scope.querySelectorAll(".v2-opt-pick").forEach((el) => {
    el.closest(".v2-opt-block")?.classList.remove("is-picking");
    el.remove();
  });
  scope.querySelectorAll(".v2-opt-block.is-picking").forEach((el) => el.classList.remove("is-picking"));
}

export function navOf(root: HTMLElement): NavMem {
  let mem = navMem.get(root);
  if (!mem) {
    mem = { block: null, hour: null, lane: null, cell: null, merged: null, hours: null, frame: null, col: "" };
    navMem.set(root, mem);
  }
  return mem;
}

function frameOf(root: HTMLElement, mem: NavMem) {
  if (mem.frame?.isConnected) return mem.frame;
  mem.frame = root.querySelector(".v2-opt-frame");
  return mem.frame;
}

export function hideFrame(mem: NavMem) {
  if (!mem.frame) return;
  mem.frame.hidden = true;
  mem.col = "";
}

function placeFrame(root: HTMLElement, mem: NavMem, hit: SlotHit, label: string) {
  const frame = frameOf(root, mem);
  if (!frame) return;
  const host = frame.parentElement;
  if (!host) return;
  const hostBox = host.getBoundingClientRect();
  const cellBox = hit.cell.getBoundingClientRect();
  const col = String(hit.half);
  frame.style.left = `${cellBox.left - hostBox.left + cellBox.width / 2}px`;
  frame.style.top = `${cellBox.top - hostBox.top - 5}px`;
  frame.style.width = "max-content";
  frame.style.height = "auto";
  frame.style.bottom = "auto";
  if (mem.col !== col) {
    frame.textContent = label;
    mem.col = col;
  }
  frame.hidden = false;
}

export function applyNav(root: HTMLElement, hit: SlotHit | null) {
  const kit = root.classList.contains("is-kit");
  const mem = navOf(root);
  if (!hit) {
    if (!root.dataset.row && !mem.block && !mem.hour) return;
    mem.block?.classList.remove("is-hot");
    mem.lane?.classList.remove("is-hot");
    mem.cell?.classList.remove("is-hover");
    mem.merged?.classList.remove("is-hover");
    mem.hour?.classList.remove("is-hot", "is-early", "is-late");
    mem.block = null;
    mem.lane = null;
    mem.cell = null;
    mem.merged = null;
    mem.hour = null;
    delete root.dataset.row;
    delete root.dataset.lane;
    delete root.dataset.half;
    hideFrame(mem);
    return;
  }
  const slot = String(hit.half);
  const col = String(hit.hour);
  const row = String(hit.dayIdx);
  const lane = hit.lane;
  const late = hit.half % 2 === 1;
  const hoverable = !hit.cell.classList.contains("is-lock");
  if (
    root.dataset.half === slot
    && root.dataset.row === row
    && root.dataset.lane === lane
    && !mem.frame?.hidden
    && mem.col === slot
  ) {
    return;
  }
  const nextBlock = hit.cell.closest(".v2-opt-block");
  if (mem.block !== nextBlock) {
    mem.block?.classList.remove("is-hot");
    nextBlock?.classList.add("is-hot");
    mem.block = nextBlock;
  }
  const nextCell = hoverable ? hit.cell : null;
  if (mem.cell !== nextCell) {
    mem.cell?.classList.remove("is-hover");
    nextCell?.classList.add("is-hover");
    mem.cell = nextCell;
  }
  const mergedTrack = hit.cell.closest(".v2-opt-track");
  const mergedStart = hit.mergedStartHalf;
  const mergedEnd = hit.mergedEndHalf;
  const nextMerged = hoverable && mergedTrack && mergedStart != null && mergedEnd != null
    ? mergedTrack.querySelector<HTMLElement>(`.v2-opt-merged[data-start-half="${mergedStart}"][data-end-half="${mergedEnd}"]`)
    : null;
  if (mem.merged !== nextMerged) {
    mem.merged?.classList.remove("is-hover");
    nextMerged?.classList.add("is-hover");
    mem.merged = nextMerged;
  }
  if (nextMerged && mergedStart != null && mergedEnd != null) {
    const span = Math.max(1, mergedEnd - mergedStart);
    nextMerged.style.setProperty("--merged-hover-left", `${((hit.half - mergedStart) / span) * 100}%`);
    nextMerged.style.setProperty("--merged-hover-width", `${100 / span}%`);
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
  if (hoverable) {
    const startHalf = hit.rangeStartHalf ?? hit.half;
    const endHalf = hit.rangeEndHalf ?? hit.half + 1;
    placeFrame(root, mem, hit, slotRangeSpan(startHalf, endHalf - 1));
  }
  else hideFrame(mem);
}
