import { useTranslation } from "react-i18next";

export function FoldHead({
  kicker,
  title,
  lead,
  open,
  onToggle,
}: {
  kicker: string;
  title: string;
  lead?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`v2-fold-head${open ? " is-open" : ""}`}>
      <div className="v2-fold-copy">
        <span className="v2-admin-kicker">{kicker}</span>
        <h2>{title}</h2>
        {open && lead ? <p className="v2-fold-lead">{lead}</p> : null}
      </div>
      <button type="button" className="v2-ctrl v2-fold-btn" onClick={onToggle}>
        {open ? t("admin.fold.close") : t("admin.fold.open")}
      </button>
    </div>
  );
}
