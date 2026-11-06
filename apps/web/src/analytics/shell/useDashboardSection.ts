import { useSyncExternalStore } from "react";
import { resolveDashboardSection } from "./routes";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const currentHash = () => window.location.hash;
const serverHash = () => "#dashboard";

export function useDashboardSection() {
  return resolveDashboardSection(useSyncExternalStore(subscribe, currentHash, serverHash));
}
