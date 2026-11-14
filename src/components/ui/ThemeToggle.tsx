"use client";

import { useTheme } from "./ThemeProvider";

/**
 * One icon button: a moon in the light theme (switch to dark), a sun in the
 * dark theme (switch to light). Until the person clicks, the theme follows the
 * operating system.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setPreference } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={label}
      title={label}
      onClick={() => setPreference(next)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}
