export type ToastKind = "ok" | "off" | "err";

const ICONS: Record<ToastKind, string> = {
  ok: "fa-solid fa-check",
  off: "fa-solid fa-minus",
  err: "fa-solid fa-circle-exclamation",
};

let host: HTMLDivElement | null = null;
let hideTimer = 0;

export function showV2Toast(kind: ToastKind, title: string) {
  if (typeof document === "undefined") return;
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  host.className = `v2-toast is-${kind}`;
  host.replaceChildren();
  const icon = document.createElement("i");
  icon.className = ICONS[kind];
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = title;
  host.append(icon, label);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(
    () => {
      host?.remove();
      host = null;
    },
    kind === "err" ? 4200 : 2600,
  );
}
