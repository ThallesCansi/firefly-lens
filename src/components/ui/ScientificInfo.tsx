"use client";

import { useId, useRef } from "react";

const concepts = {
  activity: {
    title: "Harmonized activity",
    body: "A relative index of calibrated shared-grid activity, displayed from 0 to 100. It is not fire count, burned area, severity or probability.",
    anchor: "formulation",
  },
  hotspot: {
    title: "Hotspot",
    body: "One thermal pixel detected by a sensor at an acquisition time. One fire may create multiple detections; a pixel may contain more than one fire.",
    anchor: "hotspot",
  },
  median: {
    title: "Historical median",
    body: "The median harmonized total for the same calendar month across all available years in this area. The selected year is included. A zero median has no defined ratio.",
    anchor: "monthly-climatology",
  },
  anomaly: {
    title: "Seasonal comparison and daily anomalies",
    body: "The monthly ring marks at least twice the same-month median. Daily unusual-activity flags use a separate local median/MAD rule, not a seasonal z-score or forecast.",
    anchor: "robust-anomalies",
  },
  frp: {
    title: "Fire radiative power (FRP)",
    body: "Radiative energy release rate in MW. This table sums reported values per sensor; it does not integrate total fire energy or isolate independent events.",
    anchor: "frp",
  },
  scaled: {
    title: "Scaled sensor activity",
    body: "Each sensor’s daily shared-grid activity, calibrated to the common reference and capped at 100. These rows are separate sensor views, not summed fire counts.",
    anchor: "formulation",
  },
};

export function ScientificInfo({
  concept,
}: {
  concept: keyof typeof concepts;
}) {
  const id = useId();
  const popover = useRef<HTMLSpanElement>(null);
  const info = concepts[concept];
  return (
    <span
      className="scientific-info"
      onKeyDown={(e) => {
        // Let the native popover dismiss first; Escape must not also close the analysis drawer.
        if (e.key === "Escape" && popover.current?.matches(":popover-open"))
          e.stopPropagation();
      }}
    >
      <button
        type="button"
        className="scientific-info-trigger"
        aria-label={`Explain ${info.title}`}
        aria-haspopup="dialog"
        popoverTarget={id}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const el = popover.current;
          if (!el) return;
          el.style.left = `${Math.max(12, Math.min(rect.left - 12, innerWidth - Math.min(320, innerWidth - 24) - 12))}px`;
          el.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - 240))}px`;
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v5M10 5.5v1" />
        </svg>
      </button>
      <span
        id={id}
        ref={popover}
        popover="auto"
        className="scientific-popover"
        role="dialog"
        aria-labelledby={`${id}-heading`}
      >
        <strong id={`${id}-heading`}>{info.title}</strong>
        <span>{info.body}</span>
        <a href={`/method#${info.anchor}`}>Read the method ↗</a>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          aria-label="Close explanation"
        >
          ×
        </button>
      </span>
    </span>
  );
}
