const KEY = "v2-ui-theme";

export type UiTheme = "dark" | "light";

export function loadTheme(): UiTheme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: UiTheme = loadTheme()) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiTheme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function saveTheme(theme: UiTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* quota */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event("v2-theme"));
}

if (typeof document !== "undefined") applyTheme();
