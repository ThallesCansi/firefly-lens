"use client";

import { useState, type ReactNode } from "react";
import type { Sensor } from "@/lib/data/types";

export type SpatialTool = "navigate" | "draw" | "coordinates";

export function MapToolbar({
  tool,
  onTool,
  onSelectAdministrative,
  administrativeActive = false,
  onSearch,
  searchActive = false,
}: {
  tool: SpatialTool;
  onTool: (tool: SpatialTool) => void;
  onSelectAdministrative?: () => void;
  administrativeActive?: boolean;
  /** Opens place search; shown first, since finding a place comes before selecting it. */
  onSearch?: () => void;
  searchActive?: boolean;
}) {
  // Two groups, each tool named on screen: find a place, then choose how to
  // select an area. Clearing lives on the selection card, resetting the view
  // in the map controls.
  return (
    <div
      className="map-toolbar map-surface"
      role="toolbar"
      aria-label="Spatial tools"
      aria-orientation="horizontal"
    >
      {onSearch && (
        <>
          <Tool
            label="Search"
            hint="/"
            icon="search"
            active={searchActive}
            onClick={onSearch}
          />
          <span className="map-toolbar-rule" aria-hidden="true" />
        </>
      )}
      <Tool
        label="Navigate"
        icon="navigate"
        active={
          tool === "navigate" && !administrativeActive && !searchActive
        }
        onClick={() => onTool("navigate")}
      />
      <Tool
        label={tool === "draw" ? "Cancel drawing" : "Draw area"}
        icon="rectangle"
        active={tool === "draw"}
        onClick={() => onTool(tool === "draw" ? "navigate" : "draw")}
      />
      {onSelectAdministrative && (
        <Tool
          label="Pick a state"
          icon="administrative"
          active={administrativeActive}
          onClick={onSelectAdministrative}
        />
      )}
      <Tool
        label="Coordinates"
        icon="coordinates"
        active={tool === "coordinates"}
        onClick={() =>
          onTool(tool === "coordinates" ? "navigate" : "coordinates")
        }
      />
    </div>
  );
}

/** Which sensors the map draws, as two toggle chips. */
export function MapLayerControl({
  sensors,
  onChange,
}: {
  sensors: Sensor[];
  onChange: (sensors: Sensor[]) => void;
}) {
  return (
    <div className="map-layers" role="group" aria-label="Visible detection layers">
      {(["MODIS", "VIIRS"] as Sensor[]).map((sensor) => {
        const on = sensors.includes(sensor);
        return (
          <button
            key={sensor}
            type="button"
            className="layer-chip"
            aria-pressed={on}
            title={on ? `Hide ${sensor}` : `Show ${sensor}`}
            onClick={() => onChange(on ? sensors.filter((s) => s !== sensor) : [...sensors, sensor])}
          >
            <span aria-hidden="true" className={sensor === "MODIS" ? "sensor-ring" : "sensor-dot"} />
            {sensor}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The map card: what the map shows (period and sensors) in one surface. On a
 * phone it folds into a one-line chip that opens on tap.
 */
export function MapCard({
  summary,
  hint,
  children,
}: {
  /** One line for the folded chip, e.g. "Sep 2026 · 2 layers". */
  summary: string;
  /** Shown under the controls, e.g. "Select an area to load detections". */
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="map-card map-surface" data-open={open} aria-label="Map period and layers">
      <button
        type="button"
        className="map-card-chip"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        {summary}
      </button>
      <div className="map-card-body">
        {children}
        {hint && <p className="map-card-hint">{hint}</p>}
      </div>
    </section>
  );
}

function Tool({
  label,
  hint,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  /** Keyboard shortcut, shown as a key cap after the label. */
  hint?: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const paths: Record<string, ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.4-4.4" />
      </>
    ),
    administrative: (
      <>
        <path d="M3 4h7l4 3h7v12h-7l-4-3H3zM10 4v12M14 7v12" />
      </>
    ),
    navigate: <path d="m5 3 14 8-8 2-2 8z" />,
    rectangle: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="1" />
        <path d="M2 5h4M4 3v4M18 19h4M20 17v4" />
      </>
    ),
    coordinates: (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
      </>
    ),
  };
  return (
    <button
      type="button"
      aria-keyshortcuts={hint}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[icon]}
      </svg>
      <span className="map-tool-label">{label}</span>
      {hint && <kbd aria-hidden="true">{hint}</kbd>}
    </button>
  );
}
