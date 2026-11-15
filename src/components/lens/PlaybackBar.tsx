"use client";

import { useEffect, useMemo, useState } from "react";
import { fireData } from "@/lib/data/source";
import { MONTHS } from "@/lib/format";
import { monthsBetween } from "@/lib/usePlayback";

/** Time a month stays on screen at 1×. */
const FRAME_MS = 900;
const SPEEDS = [0.5, 1, 2, 4];

const label = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3)} ${month.slice(0, 4)}`;

function MonthYear({
  value,
  onChange,
  name,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  name: string;
  min: string;
  max: string;
}) {
  const clamp = (v: string) => (v < min ? min : v > max ? max : v);
  return (
    <span className="playback-when">
      <select
        aria-label={`${name} month`}
        className="field"
        value={value.slice(5, 7)}
        onChange={(e) => onChange(clamp(`${value.slice(0, 4)}-${e.target.value}`))}
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, "0")}>
            {m.slice(0, 3)}
          </option>
        ))}
      </select>
      <select
        aria-label={`${name} year`}
        className="field num"
        value={value.slice(0, 4)}
        onChange={(e) => onChange(clamp(`${e.target.value}-${value.slice(5, 7)}`))}
      >
        {Array.from({ length: fireData.lastYear - fireData.firstYear + 1 }, (_, i) => fireData.lastYear - i).map(
          (y) => (
            <option key={y}>{y}</option>
          ),
        )}
      </select>
    </span>
  );
}

/**
 * Plays the map month by month between two months: the hot spots on the map
 * change with each step, all drawn on one scale so the season's rise and fall
 * shows. The slider moves to any month of the range.
 */
export function PlaybackBar({
  from,
  to,
  onRange,
  period,
  onPeriod,
  hasArea,
  ready,
  error,
  onClose,
}: {
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  /** The map's current period; only its month is used. */
  period: string;
  onPeriod: (month: string) => void;
  /** Detections load only inside a selected area. */
  hasArea: boolean;
  /** Every month of the range is loaded. */
  ready: boolean;
  error: boolean;
  onClose: () => void;
}) {
  const months = useMemo(() => monthsBetween(from, to), [from, to]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const current = period.slice(0, 7);
  const index = Math.max(0, months.indexOf(current));
  const canPlay = hasArea && ready && months.length > 1;

  // One step per tick; the last month stops the playback.
  useEffect(() => {
    if (!playing || !canPlay) return;
    const id = window.setTimeout(() => {
      const at = months.indexOf(current);
      if (at < 0 || at >= months.length - 1) setPlaying(false);
      else onPeriod(months[at + 1]);
    }, FRAME_MS / speed);
    return () => window.clearTimeout(id);
  }, [playing, canPlay, current, months, speed, onPeriod]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    // Start from the beginning when the map is outside the range or at its end.
    const at = months.indexOf(current);
    if (at < 0 || at === months.length - 1) onPeriod(months[0]);
    setPlaying(true);
  };

  const status = !hasArea
    ? "Select an area to play its detections."
    : error
      ? "Detections could not be loaded. Change the range to retry."
      : !ready
        ? `Loading ${months.length} months…`
        : `${months.length} months · one size scale for every month`;

  return (
    <section className="playback-bar map-surface" aria-label="Time-lapse">
      <div className="playback-row">
        <button
          type="button"
          className="playback-play"
          onClick={toggle}
          disabled={!canPlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {/* Nudged right: a triangle's visual centre sits left of its box's. */}
              <path d="M8.5 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8a1 1 0 0 0-1.5.86Z" />
            </svg>
          )}
        </button>
        <output className="playback-now num" aria-live={playing ? "off" : "polite"}>
          {label(months[index] ?? current)}
        </output>
        <input
          type="range"
          className="playback-scrub"
          min={0}
          max={Math.max(0, months.length - 1)}
          value={index}
          disabled={!canPlay}
          aria-label="Month of the time-lapse"
          aria-valuetext={label(months[index] ?? current)}
          onChange={(e) => {
            setPlaying(false);
            onPeriod(months[Number(e.target.value)]);
          }}
        />
        <button
          type="button"
          className="playback-speed num"
          aria-label={`Speed ${speed}×. Change speed`}
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
        >
          {speed}×
        </button>
        <button type="button" className="playback-close" aria-label="Close the time-lapse" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="playback-row playback-range">
        <span className="playback-range-label">From</span>
        <MonthYear
          name="Start"
          value={from}
          min={fireData.firstMonth}
          max={to}
          onChange={(v) => {
            setPlaying(false);
            onRange(v, to);
          }}
        />
        <span className="playback-range-label">to</span>
        <MonthYear
          name="End"
          value={to}
          min={from}
          max={fireData.lastMonth}
          onChange={(v) => {
            setPlaying(false);
            onRange(from, v);
          }}
        />
        <p className="playback-status" role="status">
          {status}
        </p>
      </div>
    </section>
  );
}
