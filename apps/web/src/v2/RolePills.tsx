import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { GuildRole } from "../data/guild";
import { loadTheme } from "./theme";

export type RoleCount = { role: GuildRole; n: number };

export function catalogRoles(lists: { discordRoles?: GuildRole[]; roles?: GuildRole[] }[]): RoleCount[] {
  const map = new Map<string, RoleCount>();
  for (const row of lists) {
    for (const role of row.discordRoles ?? row.roles ?? []) {
      const prev = map.get(role.id);
      if (prev) prev.n += 1;
      else map.set(role.id, { role, n: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.n - a.n || a.role.name.localeCompare(b.role.name, "ru"));
}

function roleStyle(color: string | null | undefined) {
  if (!color) return undefined;
  return { ["--role" as string]: color } as CSSProperties;
}

export function RolePills({ roles, max = 2 }: { roles: GuildRole[]; max?: number }) {
  if (!roles.length) return <span className="v2-muted">—</span>;
  const shown = roles.slice(0, max);
  const extra = roles.length - shown.length;
  const all = roles.map((role) => role.name).join(" · ");
  return (
    <div className="v2-role-pills" title={all}>
      {shown.map((role) => (
        <span key={role.id} className="v2-role-pill" style={roleStyle(role.color)} title={all}>
          {role.name}
        </span>
      ))}
      {extra > 0 ? (
        <span className="v2-role-pill is-more" title={roles.slice(max).map((role) => role.name).join(" · ")}>
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function popPos(el: HTMLElement, count: number) {
  const box = el.getBoundingClientRect();
  const height = Math.min(280, 36 + count * 26);
  const top = box.bottom + 4 + height > window.innerHeight ? Math.max(8, box.top - height - 4) : box.bottom + 4;
  return { top, left: Math.min(box.left, window.innerWidth - 240) };
}

export function RolePick({
  roles,
  picked,
  onToggle,
  label,
  emptyLabel,
}: {
  roles: RoleCount[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  label: string;
  emptyLabel: string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const selected = roles.filter((row) => picked.has(row.role.id));
  const summary = selected.length
    ? `${selected.slice(0, 2).map((row) => row.role.name).join(" · ")}${selected.length > 2 ? ` +${selected.length - 2}` : ""}`
    : emptyLabel;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = btnRef.current;
      if (el) setPos(popPos(el, roles.length));
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (popRef.current?.contains(event.target as Node)) return;
      place();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, roles.length]);

  return (
    <div className="v2-mem-pick">
      <button
        ref={btnRef}
        type="button"
        className={`v2-ctrl v2-mem-pick-btn${open ? " is-open" : ""}${picked.size ? " is-on" : ""}`}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const el = btnRef.current;
          setOpen((was) => {
            if (!was && el) setPos(popPos(el, roles.length));
            return !was;
          });
        }}
      >
        <span>{summary}</span>
        <i className="fa-solid fa-angle-down" />
      </button>
      {open
        ? createPortal(
            <div ref={popRef} className={`v2-mem-pick-pop is-roles theme-${loadTheme()}`} style={{ top: pos.top, left: pos.left }} role="listbox" aria-multiselectable="true">
              <b>{label}</b>
              <div className="v2-mem-pick-list">
                {roles.map(({ role, n }) => {
                  const on = picked.has(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      role="option"
                      className={on ? "is-on" : n === 0 ? "is-dim" : undefined}
                      aria-selected={on}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onToggle(role.id)}
                    >
                      <i className="v2-role-swatch" style={roleStyle(role.color)} aria-hidden />
                      <span>{role.name}</span>
                      <small>{n}</small>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
