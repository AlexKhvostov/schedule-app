import { useLayoutEffect, useRef, useState, type UIEvent } from "react";

export type HourGridGeometry = { width: number; viewport: number; left: number; right: number; names: number };

// Both charts use the heatmap columns, including its sticky labels and scrollbar width.
export function useHourGridAlignment(measurementKey: string = "month") {
  const [geometry, setGeometry] = useState<HourGridGeometry>({ width: 890, viewport: 0, left: 161, right: 888, names: 104 });
  const mapScroll = useRef<HTMLDivElement>(null), plotScroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroll = mapScroll.current, table = scroll?.querySelector("table");
    if (!scroll || !table) return;
    const measure = () => {
      const hours = table.querySelectorAll<HTMLElement>("thead [data-hour]");
      const first = hours[0]?.getBoundingClientRect(), last = hours[hours.length - 1]?.getBoundingClientRect();
      if (!first || !last) return;
      const box = table.getBoundingClientRect();
      const next = { width: box.width, viewport: scroll.clientWidth, left: first.left - box.left - 1, right: last.right - box.left + 1, names: table.querySelector("th")!.getBoundingClientRect().width };
      setGeometry(old => Object.keys(next).every(key => Math.abs(old[key as keyof HourGridGeometry] - next[key as keyof HourGridGeometry]) < .1) ? old : next);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(scroll); observer.observe(table);
    return () => observer.disconnect();
  }, [measurementKey]);
  const sync = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget === mapScroll.current ? plotScroll.current : mapScroll.current;
    if (target && Math.abs(target.scrollLeft - event.currentTarget.scrollLeft) > .5) target.scrollLeft = event.currentTarget.scrollLeft;
  };
  return { geometry, mapScroll, plotScroll, sync };
}
