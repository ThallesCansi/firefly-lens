import { meta } from "@/lib/data/meta";

/**
 * The map assistant's tools, as plain JSON Schema. The model chooses them on
 * the server; the browser runs them, because the map and the fire record live there.
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of an object; absent when the tool takes nothing. */
  parameters?: Record<string, unknown>;
}

export const PRESET_IDS = meta.presets.map((p) => p.id);

const object = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const PERIOD = {
  type: "string",
  description: "Optional. When the request names a time: YYYY (shows that year's busiest month), YYYY-MM or YYYY-MM-DD.",
};

export const ASSISTANT_TOOLS: ToolSpec[] = [
  {
    name: "select_state",
    description:
      "Make a Brazilian state the area of interest and frame it on the map. Accepts the state's name or its two-letter code (e.g. 'Mato Grosso', 'MT').",
    parameters: object(
      {
        state: { type: "string", description: "State name or UF code." },
        period: PERIOD,
      },
      ["state"],
    ),
  },
  {
    name: "select_region",
    description: `Make one of the ready-made study regions the area of interest: ${meta.presets
      .map((p) => `'${p.id}' (${p.name}: ${p.place})`)
      .join("; ")}.`,
    parameters: object({ region: { type: "string", enum: PRESET_IDS }, period: PERIOD }, ["region"]),
  },
  {
    name: "select_box",
    description:
      "Make a rectangle the area of interest, in degrees. Kept inside Brazil and at most 12° a side. Use it for places that are not a state or a ready-made region; find the place's coordinates with go_to_place first when you do not know them.",
    parameters: object(
      {
        west: { type: "number" },
        south: { type: "number" },
        east: { type: "number" },
        north: { type: "number" },
        name: { type: "string", description: "A short name for the area." },
        period: PERIOD,
      },
      ["west", "south", "east", "north", "name"],
    ),
  },
  {
    name: "go_to_place",
    description:
      "Move the map to a named place (city, park, river, landmark) without selecting an area. Returns the place found, its centre and its bounds.",
    parameters: object({ query: { type: "string" } }),
  },
  {
    name: "set_period",
    description:
      "Set the period the map shows: YYYY (that year's busiest month in the area of interest), YYYY-MM or YYYY-MM-DD. Also the month the analysis calendar opens on.",
    parameters: object({ period: { type: "string", description: "YYYY, YYYY-MM or YYYY-MM-DD." } }),
  },
  {
    name: "set_layers",
    description: "Choose which sensors' detections the map draws.",
    parameters: object({
      sensors: { type: "array", items: { type: "string", enum: ["MODIS", "VIIRS"] } },
    }),
  },
  {
    name: "open_analysis",
    description: "Open the analysis panel (fire calendar and area report) for the current area of interest.",
  },
  {
    name: "clear_area",
    description: "Remove the area of interest and close the analysis.",
  },
  {
    name: "get_fire_history",
    description:
      "Read the fire record of the current area of interest: yearly totals for the whole record, and monthly values between from_year and to_year (at most 5 years). Values are harmonized hot spots on the MODIS Aqua scale. Use it before stating any number.",
    parameters: object({ from_year: { type: "integer" }, to_year: { type: "integer" } }),
  },
];
