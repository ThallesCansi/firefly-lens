import { fireData } from "@/lib/data/source";
import { MONTHS } from "@/lib/format";

/** The map's month, as month and year selects; a chosen day shows as a removable chip. */
export function TemporalControl({
  period,
  onChange,
}: {
  period: string;
  onChange: (value: string) => void;
}) {
  const day = period.length === 10 ? Number(period.slice(8, 10)) : null;
  return (
    <div data-tour="period" className="temporal-control" role="group" aria-label="Map period, UTC">
      <svg
        className="temporal-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      <select
        aria-label="Map month"
        title="Map month (UTC)"
        className="field"
        value={period.slice(5, 7)}
        onChange={(e) => onChange(`${period.slice(0, 4)}-${e.target.value}`)}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, "0")}>
            {m.slice(0, 3)}
          </option>
        ))}
      </select>
      <select
        aria-label="Map year"
        title="Map year (UTC)"
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
      {day !== null && (
        <button
          type="button"
          className="day-chip"
          aria-label={`Day ${day} selected. Show the whole month`}
          title="Show the whole month"
          onClick={() => onChange(period.slice(0, 7))}
        >
          <span className="num">Day {day}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
