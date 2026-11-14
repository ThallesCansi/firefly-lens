"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
type Theme = "light" | "dark";
const KEY = "firefly-lens-theme";
const EVENT = "firefly-theme-change";
const valid = (value: unknown): value is ThemePreference =>
  ["light", "dark", "system"].includes(String(value));

function apply(preference: ThemePreference) {
  const theme =
    preference === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
}
function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const system = () => {
    if (document.documentElement.dataset.themePreference === "system")
      apply("system");
    notify();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      apply(valid(event.newValue) ? event.newValue : "system");
      notify();
    }
  };
  media.addEventListener("change", system);
  window.addEventListener("storage", storage);
  window.addEventListener(EVENT, notify);
  return () => {
    media.removeEventListener("change", system);
    window.removeEventListener("storage", storage);
    window.removeEventListener(EVENT, notify);
  };
}
const snapshot = () =>
  `${document.documentElement.dataset.themePreference ?? "system"}:${document.documentElement.dataset.theme ?? "dark"}`;
const serverSnapshot = () => "system:dark";
const ThemeContext = createContext<{
  preference: ThemePreference;
  theme: Theme;
  setPreference: (value: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [preference, theme] = value.split(":") as [ThemePreference, Theme];
  const setPreference = (next: ThemePreference) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* The current session still works when storage is blocked. */
    }
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
