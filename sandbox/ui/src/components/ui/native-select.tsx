import * as React from "react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
