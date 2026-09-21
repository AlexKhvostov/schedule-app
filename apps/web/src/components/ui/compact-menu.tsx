import { type CSSProperties, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

function faClass(icon: string) {
  return icon.startsWith("fa-brands") || icon.startsWith("fa-solid") || icon.startsWith("fa-regular")
    ? icon
    : `fa-solid ${icon}`;
}

export const CompactMenu = forwardRef<
  HTMLDivElement,
  { className?: string; style?: CSSProperties; children: ReactNode }
>(function CompactMenu({ className, style, children }, ref) {
  return (
    <div ref={ref} role="menu" className={cn("v2-compact-menu", className)} style={style}>
      {children}
    </div>
  );
});

export function CompactMenuGroup({
  label,
  tone = "default",
  children,
}: {
  label?: string;
  tone?: "default" | "root";
  children: ReactNode;
}) {
  return (
    <div className={cn("v2-compact-menu-group", tone === "root" && "is-root")}>
      {label ? <span>{label}</span> : null}
      {children}
    </div>
  );
}

export function CompactMenuItem({
  icon,
  label,
  hint,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" role="menuitem" title={hint} className={cn("v2-compact-menu-item", active && "is-on")} onClick={onClick}>
      <span className="v2-compact-menu-ico" aria-hidden>
        <i className={faClass(icon)} />
      </span>
      <span>
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
    </button>
  );
}
