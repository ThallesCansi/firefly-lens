"use client";

import type { ProjectionMode } from "@/lib/map/map-contract";

const OPTIONS: { mode: ProjectionMode; label: string; short: string }[] = [
  { mode: "globe", label: "3D Globe", short: "3D" },
  { mode: "mercator", label: "2D Map", short: "2D" },
];

/** Two-way switch between the globe and the flat map. Lives inside the map, owned by the map engine. */
export function ProjectionToggle({
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  value: ProjectionMode;
  onChange: (mode: ProjectionMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Map projection"
      className={`map-surface pointer-events-auto flex gap-1 rounded-lg p-1 text-[0.8125rem] ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = value === o.mode;
        return (
          <button
            key={o.mode}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={o.mode === "globe" ? "Show the Earth as a globe" : "Show a flat map"}
            onClick={() => onChange(o.mode)}
            className={`min-h-8 min-w-11 cursor-pointer rounded-md px-2.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? "bg-lume text-lume-ink" : "text-dim hover:text-ink"
            }`}
          >
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
