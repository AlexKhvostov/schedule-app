import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  naturalWidth: number;
  className?: string;
  children: ReactNode;
};

export function FitWidth({ naturalWidth, className, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const avail = outer.clientWidth;
      if (avail <= 0 || naturalWidth <= 0) return;
      const next = Math.min(1, avail / naturalWidth);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [naturalWidth]);

  const scaledW = naturalWidth * scale;

  return (
    <div ref={outerRef} className={cn("min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto", className)}>
      <div className="flex justify-center" style={{ width: "100%", height }}>
        <div style={{ width: scaledW, height, overflow: "hidden" }}>
          <div
            ref={innerRef}
            style={{
              width: naturalWidth,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
