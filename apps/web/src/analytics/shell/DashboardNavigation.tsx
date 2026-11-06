import { RegsButton } from "../widgets/RegsButton";
import { useTranslation } from "react-i18next";
import { dashboardHash, dashboardSections, type DashboardSectionId } from "./routes";
import styles from "../dashboard.module.css";
import { SpainClock } from "./SpainClock";

export function DashboardNavigation({ active, onRegs }: { active: DashboardSectionId; onRegs: () => void }) {
  const { t } = useTranslation("analytics");
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <i className="fa-solid fa-chart-simple" aria-hidden="true" />
        <span>{t("title")}</span>
      </div>
      <SpainClock />
      <nav className={styles.navigation} aria-label={t("navigation")}>
        {(["analysis"] as const).map((group) => (
          <div key={group} className={styles.navGroup}>
            <p className={styles.groupTitle}>{t(`groups.${group}`)}</p>
            {dashboardSections.filter((section) => section.group === group).map((section) => (
              <a key={section.id} href={dashboardHash(section.id)}
                className={`${styles.navLink} ${active === section.id ? styles.navActive : ""}`}
                aria-current={active === section.id ? "page" : undefined}>
                <i className={`fa-solid ${section.icon}`} aria-hidden="true" />
                <span>{t(`sections.${section.id}.title`)}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>
      <label className={styles.mobileNavigation}>
        <span>{t("navigation")}</span>
        <select aria-label={t("navigation")} value={active} onChange={(event) => {
          const section = dashboardSections.find((item) => item.id === event.target.value);
          if (section) window.location.hash = dashboardHash(section.id);
        }}>
          {active === "regs" && <option value="regs" hidden>{t("sections.regs.title")}</option>}
          {dashboardSections.filter(section=>section.id!=="regs").map(({ id }) => <option key={id} value={id}>{t(`sections.${id}.title`)}</option>)}
        </select>
      </label>
      <div className={styles.registryNav}><p className={styles.groupTitle}>{t("groups.players")}</p><RegsButton onClick={onRegs} /></div>
      <p className={styles.timezone}>{t("timezone")}</p>
    </aside>
  );
}
