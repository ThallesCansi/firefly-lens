"use client";

import { useTheme, type ThemePreference } from "./ThemeProvider";

export function ThemeSelect() {
  const { preference, setPreference } = useTheme();
  return (
    <label className="theme-select">
      <span className="sr-only">Color theme</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </svg>
      <select
        aria-label="Color theme"
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
