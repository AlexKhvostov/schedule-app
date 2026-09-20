import { useTranslation } from "react-i18next";

type Props = {
  nitro?: number | null;
  regular?: number | null;
  hideEmpty?: boolean;
};

function shown(n?: number | null) {
  return Boolean(n && n > 0);
}

export function PermanentPriority({ nitro, regular, hideEmpty }: Props) {
  const { t } = useTranslation();
  const nitroOn = shown(nitro);
  const regularOn = shown(regular);
  if (hideEmpty && !nitroOn && !regularOn) return null;
  return (
    <div className="v2-prio-read">
      <span>{t("cabinet.vipLabel")}</span>
      <div className="v2-prio-read-rows">
        {hideEmpty && !nitroOn ? null : (
          <div>
            <em>Nitro</em>
            <b className={nitroOn ? undefined : "is-empty"}>{nitroOn ? nitro : "—"}</b>
          </div>
        )}
        {hideEmpty && !regularOn ? null : (
          <div>
            <em>Regular</em>
            <b className={regularOn ? undefined : "is-empty"}>{regularOn ? regular : "—"}</b>
          </div>
        )}
      </div>
    </div>
  );
}
