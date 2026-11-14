import { Equation } from "./Equation";
import { MethodSection } from "./MethodSection";
import { References } from "./References";
import { STEPS } from "./RealDataNotes";

export function HarmonizationGuide() {
  return (
    <>
      <div className="method-panel-heading">
        <p className="eyebrow">01 / A SHARED RECORD</p>
        <h2>Harmonizing MODIS &amp; VIIRS</h2>
        <p>
          Real NASA FIRMS observations for Brazil, expressed on the MODIS Aqua
          scale.
        </p>
      </div>
      <MethodSection id="challenge" title="The challenge">
        <p>
          MODIS Aqua’s nominal 1 km and VIIRS NOAA-20’s 375 m pixels do not
          produce equivalent counts. Finer resolution, sensitivity, acquisition
          time and coverage affect detections. A thermal pixel is not an
          independent fire. Terra, Suomi NPP and NOAA-21 are not part of this
          record.
        </p>
      </MethodSection>
      <MethodSection
        id="approach"
        title="Our approach"
        status="IMPLEMENTED · OFFLINE PYTHON PIPELINE + STATIC BROWSER DATA"
      >
        <ol
          className="method-pipeline"
          aria-label="Implemented harmonization pipeline"
        >
          {[
            "Real FIRMS records",
            "Confidence / vegetation filters",
            "0.25° grid and ~1 km VIIRS counts",
            "Negative binomial calibration",
            "MODIS-Aqua-equivalent series",
          ].map((step, i) => (
            <li key={step}>
              <span>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <ol className="method-steps">
          {STEPS.slice(0, 4).map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <p>
          Python generates the harmonized monthly outputs and the static data
          tiles shipped in <code>public/data/brazil/</code>. The browser loads
          these files; it does not run Python or fit a new model when the map
          moves.
        </p>
      </MethodSection>
      <MethodSection id="formulation" title="Mathematical formulation">
        <Equation
          id="calibration-equation"
          title="Negative binomial calibration"
          expression={String.raw`Y_{c,t,h}\sim\operatorname{NB2}(\mu_{c,t,h},\alpha),\quad\mu=\exp(\mathbf{x}^{\mathsf T}\boldsymbol\beta)`}
          variables={[
            {
              symbol: "Y",
              meaning:
                "MODIS Aqua detections in grid cell c, month t and day/night group h.",
            },
            {
              symbol: "x, β",
              meaning:
                "Design vector and fitted coefficients; x includes log(1 + degraded VIIRS count), biome, calendar month, day/night, a zero indicator, quadratic terms and interactions.",
            },
            {
              symbol: "α",
              meaning:
                "Negative binomial dispersion; conditional variance is μ + αμ².",
            },
          ]}
        >
          <p>
            The exact design is implemented in{" "}
            <code>harmonization/pipeline/nbmodel.py</code>. Calibration uses
            April 2018–December 2023; later years are excluded from the fit
            because of Aqua orbital drift. A biome/month/day-night scale factor
            is retained as a baseline, not the principal model.
          </p>
        </Equation>
        <Equation
          id="harmonized-equation"
          title="Area totals and the continuous series"
          expression={String.raw`X_{y,m}=\sum_c w_c\begin{cases}M_{c,y,m},&y\leq2025\\\widehat\mu_{c,y,m},&y>2025\end{cases}`}
          variables={[
            {
              symbol: "w_c",
              meaning:
                "Fraction of each 0.25° cell within the selected rectangle.",
            },
            {
              symbol: "M, μ̂",
              meaning:
                "Observed MODIS Aqua monthly total and modeled VIIRS total on the Aqua scale, summing day and night.",
            },
          ]}
        >
          <p>
            Through 2025 the series keeps Aqua observations. From 2026 it uses
            converted VIIRS when estimates are available. For daily calendars,
            the modeled monthly estimate is distributed in proportion to daily
            degraded VIIRS counts; if their sum is zero, it is shared uniformly
            across available days. A modeled daily value is an allocation, not
            an independently validated daily prediction.
          </p>
        </Equation>
        <Equation
          id="uncertainty-equation"
          title="Modeled monthly uncertainty"
          expression={String.raw`s_A=\sqrt{\sum_c w_c^2 v_c+(qX_{y,m})^2},\quad[\max(0,X_{y,m}-1.96s_A),X_{y,m}+1.96s_A]`}
          variables={[
            {
              symbol: "v_c",
              meaning:
                "Exported modeled cell variance, aggregated with squared area fractions.",
            },
            {
              symbol: "q",
              meaning:
                "Common-error coefficient: 0.213 in the current metadata, calibrated on held-out biome-months.",
            },
          ]}
        >
          <p>
            The 95% range is provided only for modeled months. It assumes the
            model form is adequate and may misrepresent uncertainty for very
            small areas. The shared error term prevents aggregation from giving
            unrealistically narrow ranges.
          </p>
        </Equation>
        <Equation
          id="index-equation"
          title="Relative daily activity index"
          expression={String.raw`R=\max(1,Q_{0.95}(\{H_d:H_d>0\})),\quad I_d=\min(1,H_d/R)`}
          variables={[
            {
              symbol: "H_d",
              meaning:
                "Observed or allocated modeled daily activity on the MODIS Aqua scale.",
            },
            {
              symbol: "R, I_d",
              meaning:
                "Area-specific positive-day reference and internal 0–1 index; the interface displays 100 × I_d.",
            },
          ]}
        >
          <p>
            Quantiles use linear interpolation at (n − 1)p. The cap hides
            variation above the reference. This relative index is not a fire
            count, probability, severity or burned area. Display-range changes
            do not refit the offline model.
          </p>
        </Equation>
      </MethodSection>
      <MethodSection
        id="validation"
        title="Validation"
        status="REAL-DATA PIPELINE VALIDATION · SCOPE AND LIMITS APPLY"
      >
        <p>{STEPS[4].body}</p>
        <p>
          These are the pipeline’s reported held-out validation results, not new
          measurements from this UI change or guarantees for every selected
          rectangle. Reproducible metrics and rankings are committed under{" "}
          <code>harmonization/output/</code>. Day allocation and the heuristic
          anomaly flags are not validated as independent fire-event predictions.
        </p>
        <p>
          <a href="https://github.com/ThallesCansi/firefly-lens/blob/main/harmonization/docs/METHODOLOGY.md">
            Full methodology and validation ↗
          </a>{" "}
          ·{" "}
          <a href="https://github.com/ThallesCansi/firefly-lens/blob/main/harmonization/output/validation_metrics.csv">
            Validation metrics ↗
          </a>{" "}
          ·{" "}
          <a href="https://github.com/ThallesCansi/firefly-lens/blob/main/harmonization/output/validation_rankings.csv">
            Rankings ↗
          </a>
        </p>
      </MethodSection>
      <References ids={["modis", "viirs", "firms"]} />
    </>
  );
}
