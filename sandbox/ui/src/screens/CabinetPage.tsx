import { Badge } from "@/components/ui/badge";
import { ME } from "../schedule/marks";
import { MarkChip } from "../schedule/MarkChip";
import { useTranslation } from "react-i18next";

export function CabinetPage() {
  const { t } = useTranslation();

  const rows = [
    { label: t("cabinet.tag"), value: <MarkChip mark={ME} /> },
    { label: t("cabinet.status"), value: <Badge variant="info">{t("cabinet.statusStudent")}</Badge> },
    { label: t("cabinet.discord"), value: ME.discord },
    { label: t("cabinet.playerRoom"), value: ME.room },
    { label: t("cabinet.tz"), value: t("cabinet.tzValue") },
  ];

  return (
    <div className="max-w-xl px-6 py-5">
      <h1 className="text-base font-semibold tracking-tight">{t("cabinet.title")}</h1>
      <p className="mt-1 mb-4 text-[13px] text-foreground/70">{t("cabinet.lead")}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[140px_1fr] border-b border-border last:border-0">
            <div className="bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground/70">{row.label}</div>
            <div className="px-2.5 py-1.5 text-xs text-foreground">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
