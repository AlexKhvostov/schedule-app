import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  x: number;
  y: number;
  width?: number;
  z?: number;
  compact?: boolean;
  tall?: boolean;
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
  tall,
  footer,
  onMove,
  onFocus,
  onClose,
  children,
}: Props) {
  const drag = useRef<{ ox: number; oy: number } | null>(null);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return;
      const nextX = Math.min(window.innerWidth - 80, Math.max(8, event.clientX - drag.current.ox));
      const nextY = Math.min(window.innerHeight - 48, Math.max(8, event.clientY - drag.current.oy));
      onMove(nextX, nextY);
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onMove]);

  return createPortal(
    <div
      className={`v2-float fixed flex flex-col overflow-hidden rounded-md shadow-2xl${tall ? " max-h-[min(82vh,680px)]" : " max-h-[min(72vh,520px)]"}${compact ? " is-compact" : ""}`}
      style={{ left: x, top: y, width, zIndex: z }}
      onMouseDown={onFocus}
    >
      <div
        className={`v2-float-head flex shrink-0 cursor-grab items-center justify-between px-3 active:cursor-grabbing${compact ? " h-8" : " h-10"}`}
        onMouseDown={(event) => {
          drag.current = { ox: event.clientX - x, oy: event.clientY - y };
        }}
      >
        <h2 className={`font-semibold tracking-wide${compact ? " text-[11px]" : " text-[12px]"}`}>{title}</h2>
        <button
          type="button"
          className="v2-muted grid h-6 w-6 place-items-center border-0 bg-transparent text-[12px]"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label="close"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto${compact ? " px-1.5 py-1" : " p-3"}`}>{children}</div>
      {footer}
    </div>,
    document.body,
  );
}
