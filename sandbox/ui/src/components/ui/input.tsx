import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground shadow-none outline-none file:border-0 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
