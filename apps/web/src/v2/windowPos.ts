import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

const KEY = "v2-window-pos";

export type WindowPos = { x: number; y: number };

function readAll(): Record<string, WindowPos> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, WindowPos> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const x = Number((value as WindowPos).x);
      const y = Number((value as WindowPos).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      next[id] = { x, y };
    }
    return next;
  } catch {
    return {};
  }
}

export function loadWindowPos(id: string): WindowPos | null {
  return readAll()[id] ?? null;
}

export function saveWindowPos(id: string, pos: WindowPos) {
  if (typeof window === "undefined") return;
  try {
    const all = readAll();
    all[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export function fitFloat(x: number, y: number, width = 240) {
  if (typeof window === "undefined") return { x, y, width };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(width, Math.max(168, vw - 16));
  return {
    x: Math.min(Math.max(8, x), Math.max(8, vw - 72)),
    y: Math.min(Math.max(8, y), Math.max(8, vh - 48)),
    width: w,
  };
}

function resolveFallback(fallback?: WindowPos | (() => WindowPos)) {
  if (!fallback) return null;
  return typeof fallback === "function" ? fallback() : fallback;
}

export function useWindowPos(id: string, fallback: WindowPos | (() => WindowPos)) {
  const [pos, setPos] = useState<WindowPos>(() => loadWindowPos(id) ?? resolveFallback(fallback) ?? { x: 40, y: 80 });

  const move = useCallback(
    (x: number, y: number) => {
      const next = { x, y };
      setPos(next);
      saveWindowPos(id, next);
    },
    [id],
  );

  return [pos, move] as const;
}

export function usePlacedModal(id: string) {
  const [pos, setPos] = useState<WindowPos | null>(() => loadWindowPos(id));
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const moved = useRef(false);

  const move = useCallback(
    (x: number, y: number) => {
      const next = fitFloat(x, y);
      const box = { x: next.x, y: next.y };
      setPos(box);
      saveWindowPos(id, box);
    },
    [id],
  );

  useLayoutEffect(() => {
    if (!pos || typeof window === "undefined") return;
    const next = fitFloat(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) move(next.x, next.y);
    const onResize = () => {
      const fitted = fitFloat(pos.x, pos.y);
      if (fitted.x !== pos.x || fitted.y !== pos.y) move(fitted.x, fitted.y);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, move]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, a, select, textarea, label")) return;
    const box = panelRef.current?.getBoundingClientRect();
    const originX = pos?.x ?? box?.left ?? 8;
    const originY = pos?.y ?? box?.top ?? 8;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { ox: event.clientX - originX, oy: event.clientY - originY };
    moved.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    moved.current = true;
    move(event.clientX - drag.current.ox, event.clientY - drag.current.oy);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const ignoreBackdropClick = (event: { target: EventTarget; currentTarget: EventTarget }) => {
    if (moved.current) {
      moved.current = false;
      return true;
    }
    return event.target !== event.currentTarget;
  };

  const style: CSSProperties | undefined = pos
    ? { position: "fixed", left: pos.x, top: pos.y, margin: 0 }
    : undefined;

  return {
    pos,
    panelRef,
    style,
    ignoreBackdropClick,
    headProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
