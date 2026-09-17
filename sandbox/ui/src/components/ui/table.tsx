import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className={cn("w-full text-xs", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-header text-header-foreground", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("px-2.5 py-1.5 text-left font-medium", className)} {...props} />;
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-2.5 py-1.5", className)} {...props} />;
}
