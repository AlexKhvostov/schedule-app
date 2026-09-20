import { type ReactNode } from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="v2-cab-field">
      <span>{label}</span>
      {hint ? <small className="v2-cab-hint">{hint}</small> : null}
      {children}
    </label>
  );
}

export function Chip({ on, children, onClick, disabled }: { on: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`v2-ctrl v2-cab-chip${on ? " is-on" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function BlockBar({
  editing,
  dirty,
  saveLabel,
  cancelLabel,
  extra,
  onSave,
  onCancel,
}: {
  editing?: boolean;
  dirty?: boolean;
  saveLabel: string;
  cancelLabel?: string;
  extra?: ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const showSave = Boolean(editing && onSave);
  const showCancel = Boolean(editing && onCancel && dirty);
  if (!showSave && !showCancel && !extra) return null;
  return (
    <div className={`v2-cab-foot${extra ? " is-split" : ""}`}>
      {extra ? <div className="v2-cab-foot-extra">{extra}</div> : <span />}
      <div className="v2-cab-foot-act">
        {showCancel ? (
          <button type="button" className="v2-cab-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
        ) : null}
        {showSave ? (
          <button type="button" className={`v2-ctrl v2-save px-3${dirty ? " is-dirty" : ""}`} disabled={!dirty} onClick={onSave}>
            {saveLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
