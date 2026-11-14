"use client";

import { useRef, useState } from "react";
import type { BBox } from "@/lib/data/types";
export type MapDestination = {
  center: [number, number];
  zoom: number;
  bounds?: BBox;
  id: number;
};

export function LocationSearch({
  onNavigate,
}: {
  onNavigate: (place: MapDestination) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    (Omit<MapDestination, "id"> & { label: string })[]
  >([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, typeof results>());
  async function search(e: React.FormEvent) {
    e.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const q = query.trim();
    if (!q) return;
    setResults([]);
    const coordinate = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordinate) {
      const [, lat, lon] = coordinate.map(Number);
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        setStatus("Use latitude −90…90, longitude −180…180.");
        setBusy(false);
        return;
      }
      onNavigate({ center: [lon, lat], zoom: 8, id: Date.now() });
      setStatus("View moved. Draw an area to select it.");
      setBusy(false);
      return;
    }
    setBusy(true);
    setStatus("Searching…");
    try {
      let found = cache.current.get(q.toLowerCase());
      if (!found) {
        const response = await fetch(
          `/api/geocode?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        found = (await response.json()) as typeof results;
        if (cache.current.size >= 50) cache.current.clear();
        cache.current.set(q.toLowerCase(), found);
      }
      if (controller.signal.aborted) return;
      setResults(found);
      setStatus(
        found.length
          ? "Choose a place to navigate. This does not select an analysis area."
          : "No places found. Try a country, city or latitude, longitude.",
      );
    } catch {
      if (!controller.signal.aborted)
        setStatus(
          "Search unavailable. Try again or enter latitude, longitude.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div
      className="location-search"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          request.current?.abort();
          setResults([]);
          setStatus("");
          setBusy(false);
        }
      }}
    >
      <form onSubmit={search} role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="location-query">
          Search a place or latitude, longitude
        </label>
        <input
          id="location-query"
          className="field w-full min-w-0"
          placeholder="Search Earth · city or coordinates"
          value={query}
          maxLength={160}
          onChange={(e) => {
            request.current?.abort();
            setBusy(false);
            setQuery(e.target.value);
            setResults([]);
            setStatus("");
          }}
        />
        <button
          className="btn btn-quiet"
          disabled={busy || !query.trim()}
          type="submit"
        >
          {busy ? "…" : "Search"}
        </button>
      </form>
      {status && (
        <div className="search-results map-surface">
          <p role="status" className="text-xs text-dim">
            {status}
          </p>
          <ul>
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="search-result"
                  onClick={() => {
                    onNavigate({
                      center: r.center,
                      zoom: r.zoom,
                      bounds: r.bounds,
                      id: Date.now(),
                    });
                    setResults([]);
                    setStatus("View moved. Draw an area to select it.");
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between text-xs text-dim">
            <a
              href="https://photon.komoot.io/"
              target="_blank"
              rel="noreferrer"
            >
              Photon / © OpenStreetMap
            </a>
            <button
              type="button"
              onClick={() => {
                setResults([]);
                setStatus("");
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
