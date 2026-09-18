import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { HeatmapGrid } from "../schedule/HeatmapGrid";
import { GRID_DARK } from "../schedule/theme";
import { ME, type Mark } from "../schedule/marks";
import { planMonth } from "../schedule/plan";
import { useTranslation } from "react-i18next";

type Props = {
  cursor: Date;
  onCursorChange: (value: Date) => void;
};

function toMonthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ScheduleHeatmapPage({ cursor, onCursorChange }: Props) {
  const { t } = useTranslation();
  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const [grid, setGrid] = useState(() => planMonth(year, monthIndex));
  const [me] = useState<Mark>({ ...ME });

  useEffect(() => {
    setGrid(planMonth(year, monthIndex));
  }, [year, monthIndex]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: GRID_DARK.canvas, colorScheme: "dark" }}
    >
      <div
        className="flex items-center gap-2 border-b px-5 py-2"
        style={{ background: GRID_DARK.bar, borderColor: GRID_DARK.line }}
      >
        <span className="text-[12px] font-semibold" style={{ color: GRID_DARK.text }}>
          {t("nav.heatmap")}
        </span>
        <Input
          type="month"
          className="h-7 w-[132px] text-[12px] shadow-none"
          style={{
            borderColor: GRID_DARK.line,
            background: GRID_DARK.canvas,
            color: GRID_DARK.text,
          }}
          value={toMonthValue(cursor)}
          onChange={(event) => {
            const [nextYear, month] = event.target.value.split("-").map(Number);
            if (nextYear && month) onCursorChange(new Date(nextYear, month - 1, 1));
          }}
        />
        <span className="text-[11px]" style={{ color: GRID_DARK.hint }}>
          {t("schedule.heatmapHint")}
        </span>
      </div>
      <HeatmapGrid year={year} monthIndex={monthIndex} me={me} grid={grid} onGridChange={setGrid} />
    </div>
  );
}
