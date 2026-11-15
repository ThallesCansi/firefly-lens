"use client";

import { useEffect, useMemo, useState } from "react";
import { fireData } from "@/lib/data/source";
import { MONTHS } from "@/lib/format";
import { monthsBetween } from "@/lib/usePlayback";

/** Time a month stays on screen at 1×. */
const FRAME_MS = 900;
const SPEEDS = [0.5, 1, 2, 4];

const short = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3)} ${month.slice(0, 4)}`;
const long = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The month `n` months before `month`. */
function back(month: string, n: number) {
  const i = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 - n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

const last = fireData.lastMonth;
const PRESETS = [
  { label: "Last 12 months", from: back(last, 11) },
  { label: "Last 3 years", from: back(last, 35) },
  { label: "Since 2002", from: fireData.firstMonth },
];

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
 * Plays the map month by month between two months: the hot spots change with
 * each step, all drawn on one scale so the season's rise and fall shows.
 * While playing, the timeline fills continuously toward the next month, so
 * the progress reads as one movement rather than a series of jumps.
 */
export function PlaybackBar({
  from,
  to,
  onRange,
  period,
  onPeriod,
  hasArea,
  onSelectArea,
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
  onSelectArea: () => void;
  /** Every month of the range is loaded. */
  ready: boolean;
  error: boolean;
  onClose: () => void;
}) {
  const months = useMemo(() => monthsBetween(from, to), [from, to]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const current = period.slice(0, 7);
  const at = months.indexOf(current);
  const index = Math.max(0, at);
  const span = Math.max(1, months.length - 1);
  const canPlay = hasArea && ready && months.length > 1;
  const frameMs = FRAME_MS / speed;
  const running = playing && canPlay;

  // One step per tick; the last month stops the playback.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => {
      if (at < 0 || at >= months.length - 1) setPlaying(false);
      else onPeriod(months[at + 1]);
    }, frameMs);
    return () => window.clearTimeout(id);
  }, [running, at, months, frameMs, onPeriod]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    // Start from the beginning when the map is outside the range or at its end.
    if (at < 0 || at === months.length - 1) onPeriod(months[0]);
    setPlaying(true);
  };

  // Playing, the fill heads for the next month over exactly one frame, linearly;
  // each step retargets it, so it moves without stopping. Otherwise it settles.
  const target = running && at >= 0 && at < months.length - 1 ? at + 1 : index;
  const progress = target / span;
  const motion = {
    transitionDuration: running ? `${frameMs}ms` : "200ms",
    transitionTimingFunction: running ? "linear" : "cubic-bezier(0.23, 1, 0.32, 1)",
  };

  // A tick at each January; year labels thinned so they never crowd.
  const years = months.flatMap((m, i) => (m.endsWith("-01") ? [{ i, year: m.slice(0, 4) }] : []));
  const every = Math.ceil(years.length / 6);

  const hint = !hasArea
    ? null
    : error
      ? "Detections could not be loaded. Change the range to retry."
      : !ready
        ? `Loading ${months.length} months of detections…`
        : `Month ${index + 1} of ${months.length}`;

  return (
    <section className="playback-bar map-surface" aria-label="Time-lapse" data-playing={running}>
      <div className="playback-head">
        <button
          type="button"
          className="playback-play"
          onClick={toggle}
          disabled={!canPlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          <svg className="playback-icon" data-on={!playing} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {/* Nudged right: a triangle's visual centre sits left of its box's. */}
            <path d="M8.5 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8a1 1 0 0 0-1.5.86Z" />
          </svg>
          <svg className="playback-icon" data-on={playing} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>
        <div className="playback-title">
          <output className="playback-now" aria-live={playing ? "off" : "polite"}>
            {long(months[index] ?? current)}
          </output>
          <span className="playback-hint">{hint ?? "Time-lapse of the selected area"}</span>
        </div>
        <div className="playback-speeds" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className="num" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button type="button" className="playback-close" aria-label="Close the time-lapse" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {hasArea ? (
        <div className="playback-timeline" data-disabled={!canPlay}>
          <div className="playback-track">
            <div className="playback-fill" style={{ transform: `scaleX(${progress})`, ...motion }} />
            {years.map(({ i }) => (
              <span key={i} className="playback-tick" style={{ left: `${(i / span) * 100}%` }} />
            ))}
            <div className="playback-rail" style={{ transform: `translateX(${(progress - 1) * 100}%)`, ...motion }}>
              <span className="playback-knob" />
            </div>
            <input
              type="range"
              className="playback-input"
              min={0}
              max={span}
              value={index}
              disabled={!canPlay}
              aria-label="Month of the time-lapse"
              aria-valuetext={long(months[index] ?? current)}
              onChange={(e) => {
                setPlaying(false);
                onPeriod(months[Number(e.target.value)]);
              }}
            />
          </div>
          <div className="playback-scale num" aria-hidden="true">
            <span>{short(from)}</span>
            {years.map(({ i, year }, n) =>
              n % every === 0 && i / span > 0.08 && i / span < 0.92 ? (
                <span key={i} style={{ left: `${(i / span) * 100}%` }}>
                  {year}
                </span>
              ) : null,
            )}
            <span>{short(to)}</span>
          </div>
        </div>
      ) : (
        <div className="playback-empty">
          <p>Choose an area on the map to watch its fires month by month.</p>
          <button type="button" className="btn btn-primary" onClick={onSelectArea}>
            Draw an area
          </button>
        </div>
      )}

      <div className="playback-range">
        <span className="playback-range-fields">
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
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
        </span>
        <span className="playback-presets" role="group" aria-label="Quick ranges">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={from === p.from && to === last}
              onClick={() => {
                setPlaying(false);
                onRange(p.from, last);
              }}
            >
              {p.label}
            </button>
          ))}
        </span>
      </div>
    </section>
  );
}
