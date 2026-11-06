import { useRegs } from "../state/useRegistry";
import { useTranslation } from "react-i18next";
import type { Ref } from "react";
import type { DashboardSectionId } from "./routes";
import type { AnalyticsMode } from "../../data/analytics/http";
import styles from "../dashboard.module.css";

export function DashboardHeader({ section, headingRef, mode, onSource }: { section: DashboardSectionId; headingRef: Ref<HTMLHeadingElement>; mode: AnalyticsMode; onSource?: (mode: "demo" | "live") => void }) {
  const registry = useRegs();
  const { t } = useTranslation("analytics");
  return (
    <header className={styles.header}>
      <div>
        <h1 ref={headingRef} tabIndex={-1}>{t(`sections.${section}.title`)}</h1>
      </div>
      <div className={styles.sourceControls}>
        {onSource && <label>{t("source.label")}<select disabled={registry.busy} aria-label={t("source.label")} value={mode} onChange={e => onSource(e.target.value as "demo" | "live")}>{mode === "unconfigured" && <option value="unconfigured" disabled>{t("source.unconfigured")}</option>}<option value="demo">{t("source.demo")}</option><option value="live">{t("source.live")}</option></select></label>}
        <span className={styles.badge} title={t(mode === "demo" ? "points.demo" : mode === "live" ? "source.liveHint" : "points.unconfigured")}>
          <b className={mode === "demo" ? styles.demoBadge : undefined}>{t(`source.${mode}`)}</b> {t("timezone")}
        </span>
      </div>
    </header>
  );
}
