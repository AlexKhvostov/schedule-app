import { RegSymbol } from "../ui/RegSymbol";
import { useTranslation } from "react-i18next";
import { useRegs } from "../state/useRegistry";
import styles from "../regs.module.css";
export function RegsButton({onClick}:{onClick:()=>void}){
 const {t}=useTranslation("analytics"),regs=useRegs();
 const ours=regs.rows.filter(r=>r.side==="ours").length,theirs=regs.rows.length-ours;
 return <button type="button" className={styles.launcher} onClick={onClick} aria-label={t("regs.open")} title={regs.ready?t("regs.countSummary",{ours,theirs}):t("regs.countHint")}><span className={styles.launcherTitle}><i className="fa-solid fa-users" aria-hidden="true"/> {t("sections.regs.title")}</span><span className={`${styles.counter} ${styles.ours}`} aria-label={t("regs.oursShort")}><RegSymbol side="ours" /><b>{regs.ready?ours:regs.loading?"…":"—"}</b></span><span className={`${styles.counter} ${styles.theirs}`} aria-label={t("regs.theirsShort")}><RegSymbol side="theirs" /><b>{regs.ready?theirs:regs.loading?"…":"—"}</b></span></button>;
}
