import { useTranslation } from "react-i18next";

type Props = { nitro?: number | null; regular?: number | null; nitro250?: number | null; regular250?: number | null; hideEmpty?: boolean };
export function PermanentPriority({ nitro, regular, nitro250, regular250, hideEmpty }: Props) {
  const { t } = useTranslation();
  if (hideEmpty && ![nitro, regular, nitro250, regular250].some((n) => n && n > 0)) return null;
  return <div className="v2-prio-read"><span>{t("cabinet.vipLabel")}</span><div className="v2-prio-read-rows">
    {([["50–100 · Nitro", nitro], ["50–100 · Regular", regular], ["250-500 · Nitro", nitro250], ["250-500 · Regular", regular250]] as const).map(([label, n]) =>
      <div key={label}><em>{label}</em><b className={n && n > 0 ? undefined : "is-empty"}>{n && n > 0 ? t("priorities.coreBadge", { n }) : "—"}</b></div>)}
  </div></div>;
}
