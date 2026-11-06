import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { topOptions, sortOptions, type PointsControls as Controls } from "../../contracts/points";
import styles from "../../points.module.css";
import { SegmentedControl } from "../../ui/SegmentedControl";
export function PointsControls({ value, onChange, actions }: { value: Controls; actions?: ReactNode; onChange: (value: Partial<Controls>) => void }) {
  const { t } = useTranslation("analytics");
  return <div className={styles.controls}>
    <SegmentedControl label={t("points.top")} value={value.top} options={topOptions.map(top => ({ value: top, label: top === "all" ? t("points.all") : `Top ${top}` }))} onChange={top => onChange({ top })} />
    <SegmentedControl label={t("points.sort")} value={value.sort} options={sortOptions.map(sort => ({ value: sort, label: t(`sort.${sort}`) }))} onChange={sort => onChange({ sort })} />
    {actions}
  </div>;
}
