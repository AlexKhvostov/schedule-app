type Props = {
  dirty: boolean;
  saved?: boolean;
  label: string;
  doneLabel?: string;
  icon?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function V2SaveButton({ dirty, saved, label, doneLabel, icon, disabled, onClick }: Props) {
  if (icon) {
    return (
      <button
        type="button"
        className={`v2-save v2-save-ico${dirty ? " is-dirty" : ""}`}
        disabled={disabled || !dirty}
        title={label}
        aria-label={label}
        onClick={onClick}
      >
        <i className="fa-solid fa-floppy-disk" />
      </button>
    );
  }
  return (
    <button type="button" className={`v2-ctrl v2-save px-5${dirty ? " is-dirty" : ""}`} disabled={disabled || !dirty} onClick={onClick}>
      {saved && !dirty ? doneLabel : label}
    </button>
  );
}
