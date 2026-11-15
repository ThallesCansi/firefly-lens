"use client";

import { useState } from "react";
import { MAX_AREA_SIDE, normalizeBBox, type BBox } from "@/lib/data/types";

const FIELDS = [
  { key: 0, label: "West", min: -180, max: 180 },
  { key: 1, label: "South", min: -90, max: 90 },
  { key: 2, label: "East", min: -180, max: 180 },
  { key: 3, label: "North", min: -90, max: 90 },
] as const;

/** Sets the area of interest by coordinates, or hands over to drawing on the map. */
export function AreaForm({
  bbox,
  drawing,
  onApply,
  onToggleDraw,
}: {
  bbox: BBox;
  drawing: boolean;
  onApply: (bbox: BBox) => void;
  onToggleDraw: () => void;
}) {
  // Remount (via key) resets the fields when the area changes elsewhere.
  const [text, setText] = useState(() => bbox.map(String));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = text.map((t) => Number(t.replace(",", ".")));
    if (values.some((v, i) => !Number.isFinite(v) || text[i].trim() === "")) {
      setError("Enter all four edges as numbers, in decimal degrees.");
      return;
    }
    const [w, s, e2, n] = values;
    if (w < -180 || e2 > 180 || s < -90 || n > 90) {
      setError("Longitude runs from -180 to 180 and latitude from -90 to 90.");
      return;
    }
    if (w >= e2 || s >= n) {
      setError("West must be less than east, and south less than north.");
      return;
    }
    if (e2 - w > MAX_AREA_SIDE || n - s > MAX_AREA_SIDE) {
      setError(`Keep each side within ${MAX_AREA_SIDE} degrees.`);
      return;
    }
    setError(null);
    onApply(normalizeBBox([w, s, e2, n]));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-canopy p-4" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        {FIELDS.map((f) => (
          <label key={f.label} className="flex w-24 flex-col gap-1 text-[0.8125rem] text-dim">
            {f.label}
            <input
              inputMode="decimal"
              value={text[f.key]}
              onChange={(e) => setText((t) => t.map((v, i) => (i === f.key ? e.target.value : v)))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "area-error" : undefined}
              className="num h-11 rounded-lg border border-line bg-night px-3 text-[0.9375rem] text-ink caret-lume placeholder:text-faint focus-visible:border-lume"
            />
          </label>
        ))}
        <button type="submit" className="btn btn-primary">
          Apply coordinates
        </button>
        <button type="button" className="btn btn-quiet" aria-pressed={drawing} onClick={onToggleDraw}>
          {drawing ? "Cancel drawing" : "Draw on the map"}
        </button>
      </div>
      {error ? (
        <p id="area-error" role="alert" className="text-[0.875rem] text-ember-4">
          {error}
        </p>
      ) : (
        <p className="text-[0.8125rem] text-faint">
          Decimal degrees, west and south negative. Each side up to {MAX_AREA_SIDE} degrees. Polygon calibration covers Brazil; use the country selector for other South American national reports.
        </p>
      )}
    </form>
  );
}
