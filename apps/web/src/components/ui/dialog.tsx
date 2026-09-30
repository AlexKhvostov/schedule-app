import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Dialog({ open, title, onClose, children, footer, className }: Props) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="app-dialog-shell fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="close" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn("app-dialog-panel relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-2xl", className)}>
        <div className="app-dialog-head mb-3 flex shrink-0 items-start justify-between gap-3">
          <h2 id={titleId} className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="app-dialog-body min-h-0 overflow-auto">{children}</div>
        {footer && <div className="app-dialog-footer mt-4 flex shrink-0 justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
