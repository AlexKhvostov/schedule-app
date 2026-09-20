import * as React from "react";
import { cn } from "@/lib/utils";

export const CompactField = React.forwardRef<
  HTMLLabelElement,
  {
    label: string;
    hint?: string;
    error?: boolean;
    children: React.ReactNode;
    className?: string;
  }
>(function CompactField({ label, hint, error, children, className }, ref) {
  return (
    <label ref={ref} className={cn("v2-field", error ? "is-bad" : undefined, className)}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
});
