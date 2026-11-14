import type { ReactNode } from "react";
import type { Sensor } from "@/lib/data/types";

export type SpatialTool = "navigate" | "draw" | "coordinates";

export function MapToolbar({
  tool,
  hasArea,
  onTool,
  onClear,
  onReset,
  onSelectAdministrative,
  administrativeActive = false,
  onSearch,
  searchActive = false,
}: {
  tool: SpatialTool;
  hasArea: boolean;
  onTool: (tool: SpatialTool) => void;
  onClear: () => void;
  onReset: () => void;
  onSelectAdministrative?: () => void;
  administrativeActive?: boolean;
  /** Opens place search; shown first, since finding a place comes before selecting it. */
  onSearch?: () => void;
  searchActive?: boolean;
}) {
  return (
    <div
      className="map-toolbar map-surface"
      role="toolbar"
      aria-label="Spatial tools"
    >
      {onSearch && (
        <Tool
          label="Search places (/)"
          icon="search"
          active={searchActive}
          onClick={onSearch}
        />
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
        label={tool === "draw" ? "Cancel drawing" : "Draw an area"}
        icon="rectangle"
        active={tool === "draw"}
        onClick={() => onTool(tool === "draw" ? "navigate" : "draw")}
      />
      <Tool
        label="Coordinates and regions"
        icon="coordinates"
        active={tool === "coordinates"}
        onClick={() =>
          onTool(tool === "coordinates" ? "navigate" : "coordinates")
        }
      />
      <Tool
        label="Clear selection"
        icon="clear"
        disabled={!hasArea}
        onClick={onClear}
      />
      {onSelectAdministrative && (
        <Tool
          label="Select a state"
          icon="administrative"
          active={administrativeActive}
          onClick={onSelectAdministrative}
        />
      )}
      <Tool label="Reset view" icon="reset" onClick={onReset} />
    </div>
  );
}

export function MapLayerControl({
  sensors,
  onChange,
}: {
  sensors: Sensor[];
  onChange: (sensors: Sensor[]) => void;
}) {
  return (
    <fieldset className="map-layers map-surface">
      <legend className="sr-only">Visible detection layers</legend>
      <span className="text-xs text-dim">LAYERS</span>
      {(["MODIS", "VIIRS"] as Sensor[]).map((sensor) => (
        <label key={sensor} className="flex min-h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sensors.includes(sensor)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...sensors, sensor]
                  : sensors.filter((s) => s !== sensor),
              )
            }
          />
          <span className={sensor === "MODIS" ? "sensor-ring" : "sensor-dot"} />
          {sensor}
        </label>
      ))}
    </fieldset>
  );
}

function Tool({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
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
    clear: (
      <>
        <path d="m7 7 10 10M17 7 7 17" />
        <rect x="3" y="3" width="18" height="18" rx="4" />
      </>
    ),
    reset: <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />,
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[icon]}
      </svg>
    </button>
  );
}
