import { useEffect, useRef, useState } from "react";

// Match SVG coordinates to CSS pixels so labels keep their proportions when the panel resizes.
export function useChartWidth() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(entries => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
