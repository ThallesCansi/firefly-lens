"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS } from "@/lib/format";
import { monthsBetween } from "@/lib/usePlayback";
import { Picker } from "@/components/ui/Picker";

/** The years from `first` to `last`, newest first, as picker options. */
function yearsBetween(first: string, last: string) {
  const top = Number(last.slice(0, 4));
  return Array.from({ length: top - Number(first.slice(0, 4)) + 1 }, (_, i) => {
    const y = String(top - i);
    return { value: y, label: y };
  });
}

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

/** Quick ranges, all ending at the record's last month. */
const presetsFor = (first: string, last: string) => [
  { label: "Last 12 months", from: back(last, 11) },
  { label: "Last 3 years", from: back(last, 35) },
  { label: `Since ${first.slice(0, 4)}`, from: first },
];

function MonthYear({
  value,
  onChange,
  name,
  min,
  max,
  years,
}: {
  value: string;
  onChange: (value: string) => void;
  name: string;
  min: string;
  max: string;
  years: { value: string; label: string }[];
}) {
  const clamp = (v: string) => (v < min ? min : v > max ? max : v);
  return (
    <span className="playback-when">
      <Picker
        label={`${name} month`}
        placement="up"
        value={value.slice(5, 7)}
        options={MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: m.slice(0, 3) }))}
        onChange={(v) => onChange(clamp(`${value.slice(0, 4)}-${v}`))}
      />
      <Picker
        label={`${name} year`}
        placement="up"
        className="field num"
        value={value.slice(0, 4)}
        options={years}
        onChange={(v) => onChange(clamp(`${v}-${value.slice(5, 7)}`))}
      />
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
  first,
  last,
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
  autoPlay = false,
}: {
  /** Start playing once every month is loaded, without a press. */
  autoPlay?: boolean;
  /** The months the selected record covers: Brazil's, or a country's. */
  first: string;
  last: string;
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
  const yearOptions = useMemo(() => yearsBetween(first, last), [first, last]);
  const presets = useMemo(() => presetsFor(first, last), [first, last]);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const current = period.slice(0, 7);
  const at = months.indexOf(current);
  const index = Math.max(0, at);
  const span = Math.max(1, months.length - 1);
  const canPlay = hasArea && ready && months.length > 1;
  const frameMs = FRAME_MS / speed;
  const running = playing && canPlay;
  const fill = useRef<HTMLDivElement>(null);
  /** Where the fill stood when paused, so it stays there instead of snapping back. */
  const [frozen, setFrozen] = useState<{ at: number; range: string; value: number } | null>(null);
  /** Length of the step in progress when it resumes part-way through a month. */
  const [stepMs, setStepMs] = useState<number | null>(null);
  const range = `${from}|${to}`;
  const hold = frozen && frozen.at === at && frozen.range === range ? frozen.value : null;

  /** The fill's position on screen now, 0 to 1, read from its transition. */
  const shownProgress = () => {
    const m = fill.current && /matrix\(([^,]+)/.exec(getComputedStyle(fill.current).transform);
    return m ? Number(m[1]) : index / span;
  };
  /** How far through the current month the fill has got, 0 to 1. */
  const through = (value: number) => Math.min(1, Math.max(0, value * span - at));

  // One step per tick; the last month stops the playback.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => {
      setStepMs(null);
      if (at < 0 || at >= months.length - 1) setPlaying(false);
      else onPeriod(months[at + 1]);
    }, stepMs ?? frameMs);
    return () => window.clearTimeout(id);
  }, [running, at, months, frameMs, stepMs, onPeriod]);

  const toggle = () => {
    if (playing) {
      setFrozen({ at, range, value: shownProgress() });
      setStepMs(null);
      setPlaying(false);
      return;
    }
    // Start from the beginning when the map is outside the range or at its end;
    // after a pause, finish the month from where the fill stopped.
    if (at < 0 || at === months.length - 1) onPeriod(months[0]);
    else if (hold !== null) setStepMs((1 - through(hold)) * frameMs);
    setFrozen(null);
    setPlaying(true);
  };

  const changeSpeed = (next: number) => {
    // Mid-month, the rest of the step runs at the new speed.
    if (running) setStepMs((1 - through(shownProgress())) * (FRAME_MS / next));
    setSpeed(next);
  };

  // Playing, the fill heads for the next month over exactly one frame, linearly;
  // each step retargets it, so it moves without stopping. Paused, it stays put.
  const target = running && at >= 0 && at < months.length - 1 ? at + 1 : index;
  const progress = !running && hold !== null ? hold : target / span;
  const motion = {
    transitionDuration: running ? `${stepMs ?? frameMs}ms` : hold !== null ? "0ms" : "200ms",
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
            <button key={s} type="button" className="num" aria-pressed={speed === s} onClick={() => changeSpeed(s)}>
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
            <div ref={fill} className="playback-fill" style={{ transform: `scaleX(${progress})`, ...motion }} />
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
            min={first}
            max={to}
            years={yearOptions}
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
            max={last}
            years={yearOptions}
            onChange={(v) => {
              setPlaying(false);
              onRange(from, v);
            }}
          />
        </span>
        <span className="playback-presets" role="group" aria-label="Quick ranges">
          {presets.map((p) => (
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
