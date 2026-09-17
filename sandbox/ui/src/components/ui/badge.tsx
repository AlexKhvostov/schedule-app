import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      success: "bg-emerald-400 text-emerald-950",
      info: "bg-sky-400 text-sky-950",
      warning: "bg-amber-400 text-amber-950",
      danger: "bg-rose-400 text-rose-950",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
