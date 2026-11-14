import { Equation } from "./Equation";
import { MethodSection } from "./MethodSection";
import { References } from "./References";

export function HarmonizationGuide() {
  return (
    <>
      <div className="method-panel-heading">
        <p className="eyebrow">01 / A SHARED RECORD</p>
        <h2>Harmonizing MODIS &amp; VIIRS</h2>
        <p>
          Different observations, a shared grid, and a provisional common
          activity scale.
        </p>
      </div>
      <MethodSection id="challenge" title="The challenge">
        <p>
          MODIS’s nominal 1 km and VIIRS’s 375 m active-fire pixels do not
          describe equivalent counts. Greater sensitivity to small thermal
          anomalies and finer pixels can produce more VIIRS detections for the
          same burning event. Adding raw counts would mix instrument
          characteristics with changes on the ground.
        </p>
        <p>
          Observation time, revisit frequency, viewing geometry, clouds and the
          number of operating satellites also differ. A short-lived fire may be
          sampled by one overpass and missed by another. These effects remain
          sources of uncertainty after aggregation.
        </p>
      </MethodSection>
      <MethodSection
        id="approach"
        title="Our approach"
        status="IMPLEMENTED · PROVISIONAL"
      >
        <ol
          className="method-pipeline"
          aria-label="Implemented harmonization pipeline"
        >
          {[
            "FIRMS-shaped simulated records",
            "Retain fields; group by UTC day",
            "0.05° shared grid per sensor",
            "Area-specific overlap calibration",
            "VIIRS-equivalent daily series",
          ].map((step, i) => (
            <li key={step}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
        <p>
          The input retains coordinates, acquisition time, instrument,
          satellite, brightness, confidence, FRP and day/night flags. No cloud
          masking, confidence filtering or overpass-time correction is applied.
          The current source is a deterministic simulation, not a NASA archive
          download.
        </p>
        <p>
          Each detection is assigned to grid indices floor(latitude / 0.05°) and
          floor(longitude / 0.05°). A sensor lights a cell once per UTC day,
          regardless of the number of detections inside it. The grid is about
          5.5 km north–south; its east–west dimension shrinks with latitude.
          This reduces sensitivity to pixel multiplicity, but does not remove
          resolution or detection biases.
        </p>
      </MethodSection>
      <MethodSection id="formulation" title="Mathematical formulation">
        <Equation
          id="calibration-equation"
          title="Overlap calibration"
          expression={String.raw`k=\frac{\sum_{d\in O}V_d}{\sum_{d\in O}M_d}`}
          variables={[
            {
              symbol: "Mᴅ, Vᴅ",
              meaning:
                "Distinct shared-grid cells lit by MODIS and VIIRS on UTC day d.",
            },
            {
              symbol: "O",
              meaning:
                "All record days on or after 20 January 2012, including quiet days.",
            },
            {
              symbol: "k",
              meaning:
                "VIIRS cells per MODIS cell, learned for the selected area.",
            },
          ]}
        >
          <p>
            The code uses this ratio only when both overlap sums are positive;
            otherwise k = 1. That fallback is not evidence of agreement. One
            constant is applied across all years and seasons.
          </p>
        </Equation>
        <Equation
          id="harmonized-equation"
          title="One daily series"
          expression={String.raw`H_d=\begin{cases}kM_d,&d<\text{20 Jan 2012}\\(kM_d+V_d)/2,&d\geq\text{20 Jan 2012}\end{cases}`}
          variables={[
            {
              symbol: "Hᴅ",
              meaning:
                "Harmonized activity in VIIRS-equivalent lit cells, not fires or burned area.",
            },
          ]}
        >
          <p>
            Both instruments receive equal weight after the availability date. A
            missing overpass is not distinguished from a zero count, so the mean
            can be biased low by missing coverage. Continuity is an objective to
            validate, not a demonstrated property of real observations.
          </p>
        </Equation>
        <Equation
          id="index-equation"
          title="Relative activity index"
          expression={String.raw`R=\max(1,Q_{0.95}(\{H_d:H_d>0\})),\quad I_d=\min(1,H_d/R)`}
          variables={[
            {
              symbol: "R",
              meaning:
                "95th percentile of positive daily values in the full area record, with a minimum of 1.",
            },
            {
              symbol: "Iᴅ",
              meaning:
                "Internal index from 0 to 1; the interface displays 100 × Iᴅ.",
            },
          ]}
        >
          <p>
            Quantiles use linear interpolation at position (n − 1)p in the
            sorted sample; an empty sample returns 0 before the minimum
            reference is applied. The cap suppresses differences above the
            reference. This is a relative activity index, not a probability,
            severity or area measure. Different areas use different references.
          </p>
        </Equation>
        <p>
          Calibration and reference values use the full available record.
          Changing the displayed range does not recalibrate the baseline;
          changing the area and confirming analysis does.
        </p>
      </MethodSection>
      <MethodSection
        id="validation"
        title="Validation"
        status="SIMULATION TESTS ONLY · REAL-DATA VALIDATION PENDING"
      >
        <p>
          The existing tests check deterministic inputs, spatial/date bounds,
          sensor start dates, index bounds, same-month comparisons, plausible
          seasons and detection of planted bursts. A simulated continuity test
          compares yearly totals around VIIRS’s introduction. These are
          engineering checks, not measured accuracy against real fire
          observations.
        </p>
        <p>
          Real-data evaluation still needs paired observations during overlap,
          uncertainty and residual analysis, sensitivity to grid size and
          calibration, independent reference data and checks for coverage or
          satellite-fleet changes. No real-data error estimates or accuracy
          scores are available.
        </p>
        <a href="https://github.com/ThallesCansi/firefly-lens/blob/7e2ff35eed3a9c10e8f72e60010d5ea01e782d53/src/lib/harmonize.ts">
          Inspect the implementation documented here ↗
        </a>
      </MethodSection>
      <References ids={["modis", "viirs", "firms"]} />
    </>
  );
}
