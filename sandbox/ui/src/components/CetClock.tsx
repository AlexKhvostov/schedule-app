import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CET, PLAYER_TZ, formatClock } from "../schedule/cet";

type Props = {
  layout?: "stack" | "inline";
  className?: string;
};

export function CetClock({ layout = "inline", className }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cet = formatClock(now, CET);
  const msk = formatClock(now, PLAYER_TZ);

  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-lg bg-primary px-2.5 py-0.5 text-primary-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
        layout === "stack" && "px-3 py-2",
        className,
      )}
    >
      <div className="flex h-[15px] items-center gap-1.5">
        <span className="w-7 shrink-0 text-[9px] font-bold tracking-[0.08em] uppercase text-black/80">{t("header.timezone")}</span>
        <span
          className={cn(
            "font-mono leading-none font-black tabular-nums text-black",
            layout === "stack" ? "text-[22px]" : "text-[16px]",
          )}
        >
          {cet}
        </span>
      </div>
      <div className="flex h-[13px] items-center gap-1.5">
        <span className="w-7 shrink-0 text-[9px] font-bold tracking-[0.08em] uppercase text-[#1d4ed8]/70">{t("header.mskLabel")}</span>
        <span className="font-mono text-[11px] leading-none font-semibold tabular-nums text-[#1d4ed8]/80">{msk}</span>
      </div>
    </div>
  );
}
