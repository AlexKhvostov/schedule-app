import type { RegSide } from "../../data/analytics/regs";
import styles from "./regSymbol.module.css";
/** Code-native icons: filled, faceted Red Party gem; outlined blue crystal for other regulars. */
export function RegSymbol({ side }: { side: RegSide }) {
  return <svg className={`${styles.symbol} ${styles[side]}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-reg-symbol={side}>
    {side === "ours" ? <>
      <path d="M5 4h14l4 6-11 13L1 10Z" fill="currentColor" />
      <path d="m5 4 3 6 4-6 4 6 3-6M1 10h22M8 10l4 13 4-13" fill="none" stroke="var(--card)" strokeWidth="1" strokeLinejoin="round" opacity=".7" />
      <path d="m5 4-4 6h7Z" fill="#fff" opacity=".25" />
    </> : <><path d="m12 2 10 10-10 10L2 12Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m12 2 4 10-4 10-4-10Zm-10 10h20" fill="none" stroke="currentColor" strokeWidth="1" opacity=".65" /></>}
  </svg>;
}
