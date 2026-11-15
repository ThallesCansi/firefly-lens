import { fireData } from "@/lib/data/source";
import { MONTHS } from "@/lib/format";

export function TemporalControl({
  period,
  onChange,
}: {
  period: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="temporal-control"
      role="group"
      aria-label="Map period"
    >
      <div className="temporal-head">
        <span>Map period</span>
        <span className="text-faint">UTC</span>
      </div>
      <label>
        <span className="sr-only">Map year</span>
        <select
          aria-label="Map year"
          className="field num"
          value={period.slice(0, 4)}
          onChange={(e) => onChange(`${e.target.value}-${period.slice(5, 7)}`)}
        >
          {Array.from(
            { length: fireData.lastYear - fireData.firstYear + 1 },
            (_, i) => fireData.lastYear - i,
          ).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Map month</span>
        <select
          aria-label="Map month"
          className="field"
          value={period.slice(5, 7)}
          onChange={(e) => onChange(`${period.slice(0, 4)}-${e.target.value}`)}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {period.length === 10 && (
        <button
          className="btn btn-quiet"
          onClick={() => onChange(period.slice(0, 7))}
        >
          Whole month
        </button>
      )}
    </div>
  );
}
