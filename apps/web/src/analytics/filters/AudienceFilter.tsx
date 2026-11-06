import { useId } from "react";
import { useTranslation } from "react-i18next";
import { audienceSegments, type AudienceSegment } from "../contracts/points";
import styles from "./filters.module.css";
export function AudienceFilter({ value, onChange }: { value: AudienceSegment; onChange: (segment: AudienceSegment) => void }) {
  const { t } = useTranslation("analytics");
  const labelId = useId(); const hintId = useId();
  return <label className={styles.field}><span id={labelId}>{t("filters.segment")}</span>
    <select aria-labelledby={labelId} aria-describedby={hintId} value={value} onChange={e => onChange(e.target.value as AudienceSegment)}>
      {audienceSegments.map(segment => <option key={segment} value={segment}>{t(`segments.${segment}`)}</option>)}
    </select><small id={hintId}>{t("filters.segmentHint")}</small>
  </label>;
}
