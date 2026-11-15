import type { FireRecord } from "../../../lib/harmonize";
import { meta } from "../../../lib/data/meta";
import { ScientificChart } from "./ScientificChart";

/** Present the existing tile-derived record while independent Python statistics load. */
export function BrowserHistoryChart({ record }: { record: FireRecord }) {
  return <ScientificChart title="Historical Fire Activity"
    description="Full monthly record on the MODIS Aqua scale. Solid: observed Aqua; dashed: VIIRS estimates; hollow: incomplete months. Shading shows harmonization uncertainty."
    unit="Aqua-equivalent hot spots" series={(["observed", "modeled"] as const).map((source) => ({
      label: source === "observed" ? "Observed MODIS Aqua" : "Estimated from VIIRS",
      kind: source === "observed" ? "observed" : "estimated",
      points: record.months.map((m) => ({ label: `${m.year}-${String(m.month+1).padStart(2,"0")}`,
        value: m.source === source ? m.value : null,
        lower: m.source === source ? m.lo : null, upper: m.source === source ? m.hi : null,
        partial: m.partial || (m.year === Number(meta.firstDay.slice(0,4)) && m.month === Number(meta.firstDay.slice(5,7))-1 && !meta.firstDay.endsWith("-01")),
        note: `${m.partial ? "Incomplete month · " : ""}NASA FIRMS · ${source === "modeled" ? "VIIRS NOAA-20 estimate" : "MODIS Aqua observation"}`,
      })),
    }))} />;
}
