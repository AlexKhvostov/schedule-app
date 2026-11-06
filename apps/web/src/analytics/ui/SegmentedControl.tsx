import { useId } from "react";
import styles from "./segmented.module.css";

export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const name = useId();
  return <fieldset className={styles.group}><legend>{label}</legend><div className={styles.options}>
    {options.map(option => <label key={option.value}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </div></fieldset>;
}
