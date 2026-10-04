import type { MutableRefObject, RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, type TouchEvent } from "react";
import type { OptFieldProps, TipApi } from "./types";
import { clampScheduleCellWidth, fitScheduleCellWidth, scheduleCellStride, scheduleZoomScrollLeft } from "../scheduleZoom";

type Options = Pick<OptFieldProps, "onFitWidthChange" | "onCellWidthChange"> & {
  cellWidth: number;
  zoomEnabled: boolean;
  visibleSlotCount: number;
  daysRef: RefObject<HTMLDivElement | null>;
  tipApi: MutableRefObject<TipApi>;
};

export function useOptFieldZoom({ daysRef, tipApi, cellWidth, zoomEnabled, onCellWidthChange, onFitWidthChange, visibleSlotCount }: Options) {
  const fixedWidthRef = useRef(70);

  const pinchRef = useRef<{ distance: number; width: number; contentHalf: number; focalX: number } | null>(null);

  useLayoutEffect(() => {
    const scroller = daysRef.current;
    if (!scroller || !onFitWidthChange) return;
    const report = () => {
      const gutter = scroller.querySelector<HTMLElement>(".v2-opt-hours .v2-opt-gutter");
      const fixedWidth = Math.max(70, gutter?.getBoundingClientRect().width ?? 0);
      fixedWidthRef.current = fixedWidth;
      onFitWidthChange(fitScheduleCellWidth(scroller.clientWidth, fixedWidth, 16, visibleSlotCount));
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [onFitWidthChange, visibleSlotCount]);

  const onTouchStart = useCallback((event: TouchEvent<HTMLElement>) => {
    if (!zoomEnabled || event.touches.length !== 2) return;
    const scroller = daysRef.current;
    if (!scroller) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const box = scroller.getBoundingClientRect();
    const focalX = (a.clientX + b.clientX) / 2 - box.left;
    const fixed = fixedWidthRef.current;
    pinchRef.current = {
      distance,
      width: cellWidth,
      contentHalf: Math.max(0, (scroller.scrollLeft + focalX - fixed) / scheduleCellStride(cellWidth)),
      focalX,
    };
    tipApi.current.hide();
    event.preventDefault();
  }, [cellWidth, zoomEnabled]);

  const onTouchMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || !onCellWidthChange) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = clampScheduleCellWidth(pinch.width * (distance / Math.max(1, pinch.distance)));
    onCellWidthChange(next);
    const scroller = daysRef.current;
    if (scroller) {
      scroller.scrollLeft = scheduleZoomScrollLeft(pinch.contentHalf, next, fixedWidthRef.current, pinch.focalX);
    }
    event.preventDefault();
  }, [onCellWidthChange]);

  const onTouchEnd = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length < 2) pinchRef.current = null;
  }, []);
  return { onTouchStart, onTouchMove, onTouchEnd };
}
