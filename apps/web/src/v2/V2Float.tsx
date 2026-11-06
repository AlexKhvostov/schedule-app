import { useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fitFloat } from "./windowPos";

type Props = {
  title: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  maxHeight?: number;
  z?: number;
  resizeLabel?: string;
  onResizeWidth?: (width: number) => void;
  onResizeHeight?: (height: number) => void;
  compact?: boolean;
  className?: string;
  footer?: ReactNode;
  headerActions?: ReactNode;
  onMove: (x: number, y: number) => void;
  onFocus?: () => void;
  role?: "dialog";
  onClose: () => void;
  children: ReactNode;
};

export function V2Float({
  title,
  x,
  y,
  width = 300,
  height,
  maxHeight,
  z = 40,
  resizeLabel,
  onResizeWidth,
  onResizeHeight,
  compact,
  className,
  footer,
  headerActions,
  onMove,
  onFocus,
  role,
  onClose,
  children,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const resize = useRef<{ x: number; y: number; width: number; height: number; lastX: number; lastY: number } | null>(null);
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const box = typeof window === "undefined" ? { x, y, width } : fitFloat(x, y, width);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const next = fitFloat(x, y, width);
    if (next.x !== x || next.y !== y) onMove(next.x, next.y);
    const onResize = () => {
      const fitted = fitFloat(x, y, width);
      if (fitted.x !== x || fitted.y !== y) onMove(fitted.x, fitted.y);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [x, y, width, onMove]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { ox: event.clientX - x, oy: event.clientY - y };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    const next = fitFloat(event.clientX - drag.current.ox, event.clientY - drag.current.oy, width);
    onMove(next.x, next.y);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return createPortal(
    <div
      ref={panel}
      className={`v2-float${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      style={{ left: box.x, top: box.y, width: box.width, height, maxHeight: maxHeight === undefined ? `calc(100dvh - ${box.y + 8}px)` : `min(${maxHeight}px, calc(100dvh - ${box.y + 8}px))`, zIndex: z }}
      role={role}
      aria-label={role ? title : undefined}
      onPointerDown={onFocus}
    >
      <header
        className="v2-modal-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <i className="fa-solid fa-grip-vertical v2-modal-grip" aria-hidden />
        <h2>{title}</h2>
        {headerActions}
        <button
          type="button"
          className="v2-modal-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label="close"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      <div className="v2-float-body">{children}</div>
      {footer}
      {onResizeWidth && <button
        type="button"
        className={`v2-float-resize${onResizeHeight ? " is-two-axis" : ""}`}
        aria-label={resizeLabel}
        title={resizeLabel}
        onPointerDown={(event) => {
          if (event.button !== 0 || !panel.current) return;
          const size = panel.current.getBoundingClientRect();
          event.currentTarget.setPointerCapture(event.pointerId);
          resize.current = { x: event.clientX, y: event.clientY, width: size.width, height: size.height,
            lastX: event.clientX, lastY: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = resize.current;
          if (!start) return;
          if (event.clientX !== start.lastX) onResizeWidth(start.width + event.clientX - start.x);
          if (event.clientY !== start.lastY) onResizeHeight?.(start.height + event.clientY - start.y);
          start.lastX = event.clientX;
          start.lastY = event.clientY;
        }}
        onLostPointerCapture={() => { resize.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onResizeWidth(box.width + (event.key === "ArrowLeft" ? -12 : 12));
          }
          if (onResizeHeight && panel.current && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            onResizeHeight(panel.current.getBoundingClientRect().height + (event.key === "ArrowUp" ? -12 : 12));
          }
        }}
      />}
    </div>,
    document.body,
  );
}
