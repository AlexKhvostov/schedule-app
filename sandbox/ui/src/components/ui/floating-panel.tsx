import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  x: number;
  y: number;
  onMove: (x: number, y: number) => void;
  onClose: () => void;
  children: ReactNode;
  width?: number;
};

export function FloatingPanel({ title, x, y, onMove, onClose, children, width = 300 }: Props) {
  const drag = useRef<{ ox: number; oy: number } | null>(null);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return;
      onMove(event.clientX - drag.current.ox, event.clientY - drag.current.oy);
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

  return (
    <div
      className="fixed z-[55] flex max-h-[min(72vh,520px)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
      style={{ left: x, top: y, width }}
    >
      <div
        className="flex cursor-grab items-center justify-between bg-header px-3 py-2 text-header-foreground active:cursor-grabbing"
        onMouseDown={(event) => {
          drag.current = { ox: event.clientX - x, oy: event.clientY - y };
        }}
      >
        <h2 className="text-xs font-bold tracking-wide uppercase">{title}</h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-white hover:bg-white/10 hover:text-white"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClose}
        >
          ✕
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}
