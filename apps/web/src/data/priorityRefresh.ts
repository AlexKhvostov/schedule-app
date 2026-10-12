// Wake ranking views after a successful distance write, also in another tab.
export function notifyPriorityDistanceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("priority-distance-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("priority-refresh");
    channel.postMessage("distance-changed"); channel.close();
  }
}
