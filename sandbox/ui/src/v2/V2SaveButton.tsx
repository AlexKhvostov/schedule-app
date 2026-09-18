type Props = {
  dirty: boolean;
  saved: boolean;
  label: string;
  doneLabel: string;
  onClick: () => void;
};

export function V2SaveButton({ dirty, saved, label, doneLabel, onClick }: Props) {
  return (
    <button type="button" className={`v2-ctrl v2-save px-5${dirty ? " is-dirty" : ""}`} disabled={!dirty} onClick={onClick}>
      {saved && !dirty ? doneLabel : label}
    </button>
  );
}
