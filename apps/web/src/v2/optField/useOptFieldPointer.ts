import type { MutableRefObject, RefObject } from "react";
import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";
import { monthGridKey } from "../../data/slots";
import { hoursOf, weekdayOf } from "../../schedule/capacity";
import { isPastSlot, readCet } from "../../schedule/cet";
import { isSelfSeat } from "../../schedule/marks";
import { levelAllowed, seatsOf } from "../../schedule/plan";
import { clampWorkRangeHalf, workHalfSlots } from "../../schedule/workHours";
import { applyNav, halfOnLane, hideFrame, hidePick, hitFromEvent, hitOnLane, navOf, showPick } from "../optField/dom";
import type { OptFieldProps, SlotHit, TipApi, TipPoint } from "./types";
import {
  packOwner,
  writeSeat,
  type OverwriteAsk,
  type OverwritePerson
} from "../optFieldModel";

type Options = Pick<OptFieldProps, "year" | "monthIndex" | "me" | "self" | "capacity" | "grids" | "onGridChange" | "dimPast" | "canEdit" | "skin" | "busy" | "canRemoveForeign" | "onOverwriteAsk" | "onForeignKept" | "workHours"> & { workHours: number[]; canRemoveForeign: boolean };

export function useOptFieldPointer({ year, monthIndex, me, self, capacity, grids, onGridChange, dimPast, canEdit, skin, busy, canRemoveForeign, onOverwriteAsk, onForeignKept, workHours }: Options, rootRef: RefObject<HTMLElement | null>, tipApi: MutableRefObject<TipApi>) {
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
    workHours,
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
    workHours,
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

  const applyRange = (origin: SlotHit, endHalf: number, mode: "place" | "remove") => {
    const p = propsRef.current;
    if (!p.canEdit) return;
    const now = readCet();
    const grid = p.grids[monthGridKey(origin.variant, origin.limit)];
    if (!grid?.[origin.dayIdx]) return;
    const hoursCaps = hoursOf(p.capacity, origin.limit, origin.day, weekdayOf(p.year, p.monthIndex, origin.day));
    const from = Math.min(origin.half, endHalf);
    const to = Math.max(origin.half, endHalf);
    const visible = new Set(workHalfSlots(p.workHours));
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
        if (half < from || half > to || !visible.has(half)) return item;
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
      if (emptyPass.changed) p.onGridChange(origin.variant, origin.limit, emptyPass.next);
      if (emptyPass.keptForeign) p.onForeignKept?.();
      return;
    }

    if (mode === "place") {
      if (!wipePass.displaced.size) {
        if (emptyPass.changed) p.onGridChange(origin.variant, origin.limit, emptyPass.next);
        return;
      }
      if (!canForeign) {
        if (emptyPass.changed) p.onGridChange(origin.variant, origin.limit, emptyPass.next);
        p.onForeignKept?.();
        return;
      }
      p.onOverwriteAsk?.({
        kind: "place",
        variant: origin.variant,
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
      if (emptyPass.changed) p.onGridChange(origin.variant, origin.limit, emptyPass.next);
      return;
    }
    if (!canForeign) {
      if (emptyPass.changed) p.onGridChange(origin.variant, origin.limit, emptyPass.next);
      p.onForeignKept?.();
      return;
    }
    p.onOverwriteAsk?.({
      kind: "remove",
      variant: origin.variant,
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
    const mark = seatsOf(
      p.grids[monthGridKey(hit.variant, hit.limit)]?.[hit.dayIdx]?.[hit.half],
      hit.level + 1,
    )[hit.level];
    if (hit.busyPairs?.length) {
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
    if (rootRef.current) applyNav(rootRef.current, null);
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
    const seats = seatsOf(
      p.grids[monthGridKey(hit.variant, hit.limit)]?.[hit.dayIdx]?.[hit.half],
      hit.level + 1,
    );
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
    if (root) hideFrame(navOf(root));
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.mode === "look") {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.panned = true;
      return;
    }
    const hoveredHalf = halfOnLane(drag.origin, event.clientX);
    const endHalf = clampWorkRangeHalf(drag.origin.half, hoveredHalf, propsRef.current.workHours);
    if (endHalf === drag.endHalf) return;
    drag.endHalf = endHalf;
    const root = rootRef.current;
    if (root) {
      const cursor = hitOnLane(drag.origin, endHalf);
      if (cursor) applyNav(root, cursor);
      hideFrame(navOf(root));
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
    if (event.pointerType === "touch") return;
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
    if (hit.busyPairs?.length) {
      tipApi.current.show({ ...hit, x: event.clientX + 12, y: event.clientY + 10 });
    } else {
      tipApi.current.hide();
    }
  }, []);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (dragRef.current && dragRef.current.mode !== "look") return;
    const root = rootRef.current;
    if (root) applyNav(root, null);
    tipApi.current.hide();
  }, []);
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, onPointerOver, onPointerLeave };
}
