import { useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fitFloat } from "./windowPos";

type Props = {
  title: string;
  x: number;
  y: number;
  width?: number;
  z?: number;
  compact?: boolean;
  className?: string;
  footer?: ReactNode;
  onMove: (x: number, y: number) => void;
  onFocus: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function V2Float({
  title,
  x,
  y,
  width = 300,
  z = 40,
  compact,
  className,
  footer,
  onMove,
  onFocus,
  onClose,
  children,
}: Props) {
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
      className={`v2-float${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
      style={{ left: box.x, top: box.y, width: box.width, zIndex: z }}
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
    </div>,
    document.body,
  );
}
