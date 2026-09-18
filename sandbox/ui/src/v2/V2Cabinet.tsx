import { useTranslation } from "react-i18next";
import { ME } from "../schedule/marks";
import { R } from "./tokens";

export function V2Cabinet() {
  const { t } = useTranslation();
  const rows = [
    { label: t("cabinet.tag"), value: ME.t },
    { label: t("cabinet.status"), value: t("cabinet.statusStudent") },
    { label: t("cabinet.discord"), value: ME.discord },
    { label: t("cabinet.playerRoom"), value: ME.room },
    { label: t("cabinet.tz"), value: t("cabinet.tzValue") },
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-8 py-10" style={{ color: R.text }}>
      <h1 className="text-2xl font-semibold tracking-tight">{t("cabinet.title")}</h1>
      <p className="mt-2 text-[14px]" style={{ color: R.muted }}>
        {t("cabinet.lead")}
      </p>
      <div className="mt-8 overflow-hidden rounded-md" style={{ border: `1px solid ${R.line}`, background: R.header }}>
        <div className="flex items-center gap-4 border-b px-5 py-4" style={{ borderColor: R.line }}>
          <span
            className="v2-mono inline-flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
            style={{ background: R.cyan, color: R.cyanInk }}
          >
            {ME.t}
          </span>
          <div>
            <div className="text-[16px] font-medium">{t("header.you")}</div>
            <div className="text-[12px]" style={{ color: R.muted }}>
              {t("header.roleStudent")} · {ME.tables} {t("schedule.tablesLabel").toLowerCase()}
            </div>
          </div>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[140px_1fr] border-b last:border-0" style={{ borderColor: R.line }}>
            <div className="px-5 py-3 text-[12px]" style={{ color: R.muted, background: R.panel }}>
              {row.label}
            </div>
            <div className="px-5 py-3 text-[13px]">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
