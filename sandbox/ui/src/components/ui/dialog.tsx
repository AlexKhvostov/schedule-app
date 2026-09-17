import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, title, onClose, children, footer }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
