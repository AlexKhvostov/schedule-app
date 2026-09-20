import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      success: "bg-success/15 text-success",
      info: "bg-primary/15 text-primary",
      warning: "bg-warning/15 text-warning",
      danger: "bg-destructive/15 text-destructive",
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
