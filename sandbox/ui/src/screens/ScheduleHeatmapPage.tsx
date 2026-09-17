import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { HeatmapGrid } from "../schedule/HeatmapGrid";
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f6f8fa]">
      <div className="flex items-center gap-2 border-b border-[#d0d7de] px-5 py-2">
        <span className="text-[12px] font-semibold text-[#1f2328]">{t("nav.heatmap")}</span>
        <Input
          type="month"
          className="h-7 w-[132px] border-[#d0d7de] bg-white text-[12px]"
          value={toMonthValue(cursor)}
          onChange={(event) => {
            const [nextYear, month] = event.target.value.split("-").map(Number);
            if (nextYear && month) onCursorChange(new Date(nextYear, month - 1, 1));
          }}
        />
        <span className="text-[11px] text-[#656d76]">{t("schedule.heatmapHint")}</span>
      </div>
      <HeatmapGrid year={year} monthIndex={monthIndex} me={me} grid={grid} onGridChange={setGrid} />
    </div>
  );
}
