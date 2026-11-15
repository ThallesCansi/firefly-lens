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
      className={`map-projection map-surface ${className}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          aria-pressed={value === o.mode}
          aria-label={o.label}
          title={o.mode === "globe" ? "3D globe" : "2D map"}
          disabled={disabled}
          onClick={() => onChange(o.mode)}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}
