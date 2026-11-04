import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LIMIT_OPTIONS, formatVariantLimit, limitTone } from "../schedule/capacity";

type Variant = "nitro" | "regular";
export function SchedulePairPicker({ variant, limit, onChange, disabled, hasDraft, children }: {
  variant: Variant; limit: string; onChange: (variant: Variant, limit: string) => void;
  disabled?: boolean; hasDraft?: (variant: Variant, limit: string) => boolean; children?: ReactNode;
}) {
  const { t } = useTranslation();
  return <aside className="v2-pair-picker" aria-label={t("pairPicker.label")}>
    <div className="v2-pair-picker-columns">
      {(["nitro", "regular"] as const).map((kind) => <div className="v2-pair-picker-column" key={kind} data-variant={kind}>
        <strong>{kind === "nitro" ? "Nitro" : "Regular"}</strong>
        {LIMIT_OPTIONS.map((value) => {
          const label = formatVariantLimit(kind, value);
          const dirty = hasDraft?.(kind, value);
          return <button key={value} type="button" className="v2-pair-choice" data-variant={kind}
            aria-label={label} aria-pressed={variant === kind && limit === value}
            title={dirty ? t("pairPicker.unsaved", { pair: label }) : label}
            disabled={disabled} style={{ color: limitTone(value) }} onClick={() => onChange(kind, value)}>
            <span>{label}</span>{dirty && <small aria-hidden>*</small>}
          </button>;
        })}
      </div>)}
    </div>
    {children}
  </aside>;
}
