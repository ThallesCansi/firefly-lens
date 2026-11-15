import { Equation } from "./Equation";
import { MethodSection } from "./MethodSection";
import { References } from "./References";
import { MonthlyEvidence, DailyEvidence } from "./MethodEvidence";
import { meta } from "@/lib/data/meta";
import {
  UNUSUAL_FLOOR,
  UNUSUAL_PROBABILITY,
  UNUSUAL_SHARE,
} from "@/lib/unusual";

export function AnomaliesGuide() {
  return (
    <>
      <div className="method-panel-heading">
        <p className="eyebrow">02 / CONTEXT BEFORE EXCEPTION</p>
        <h2>Historical Activity &amp; Seasonal Anomalies</h2>
        <p>
          Compare like months. Separate the implemented indicators from
          statistical methods still to be integrated.
        </p>
      </div>
      <MethodSection id="seasonality" title="Why seasonality matters">
        <p>
          A rise during a normally quiet month has a different historical
          context from the same rise during a region’s usual peak. Seasonal
          comparisons must use the same calendar month in the same area, with
          consistent processing and adequate coverage.
        </p>
        <p>
          The implemented typical season uses the mean daily index across years,
          after folding 29 February onto 28 February, followed by a circular
          15-day moving average. It expands around the peak while activity is at
          least 35% of that peak. This is a descriptive season estimate, not a
          forecast.
        </p>
      </MethodSection>
      <MethodSection
        id="monthly-climatology"
        title="Monthly climatology"
        status="MONTHLY SUMS, MEDIAN, RATIO AND RANK · IMPLEMENTED"
      >
        <Equation
          id="monthly-equation"
          title="Same-month historical comparison"
          expression={String.raw`X_{y,m}=\sum_{d\in(y,m)}H_d,\quad B_m=\operatorname{median}_{y}(X_{y,m}),\quad A_{y,m}=X_{y,m}/B_m`}
          variables={[
            {
              symbol: "Xʏ,ₘ",
              meaning:
                "Sum of daily harmonized values in year y, month m: MODIS-Aqua-equivalent hot spots.",
            },
            {
              symbol: "Bₘ",
              meaning:
                "Median of the same calendar month over 2003-2025; a selected year is included only when it lies in that reference period.",
            },
            {
              symbol: "Aʏ,ₘ",
              meaning:
                "Ratio to that median; undefined when the median is zero.",
            },
          ]}
        >
          <p>
            The monthly grid rings ratios ≥ 2. A positive total with zero median
            is described as activity in a usually quiet month, without an
            infinite ratio. Rank is 1 plus the number of complete same-month
            totals strictly greater than the selected value; ties share a rank.
            Partial months are identified separately.
          </p>
        </Equation>
        <MonthlyEvidence />
        <p>
          Colours represent monthly totals on a common scale derived from the
          98th percentile of positive monthly totals across the record; colour
          alone is not a seasonal anomaly. The ring and same-month median
          provide that separate comparison.
        </p>
        <div className="method-table-wrap">
          <table>
            <caption>
              Monthly reference metrics and current implementation
            </caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Meaning</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Median</th>
                <td>Middle same-month total; less sensitive to extremes.</td>
                <td>Implemented</td>
              </tr>
              <tr>
                <th scope="row">Mean</th>
                <td>Average of valid totals for one calendar month.</td>
                <td>Conceptual extension</td>
              </tr>
              <tr>
                <th scope="row">Standard deviation</th>
                <td>Spread around that monthly mean, in the same units.</td>
                <td>Conceptual extension</td>
              </tr>
              <tr>
                <th scope="row">Seasonal percentiles</th>
                <td>Position within a same-month reference distribution.</td>
                <td>Conceptual extension</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Equation
          id="reference-statistics-equation"
          title="Reference mean and spread — conceptual extension"
          expression={String.raw`\mu_m=\frac{1}{n_m}\sum_y X_{y,m},\quad s_m=\sqrt{\frac{\sum_y(X_{y,m}-\mu_m)^2}{n_m-1}}`}
          variables={[
            {
              symbol: "nₘ",
              meaning:
                "Number of valid reference-year values for the same calendar month m.",
            },
            {
              symbol: "μₘ, sₘ",
              meaning:
                "Reference mean and sample standard deviation, both in Aqua-equivalent hot spots.",
            },
          ]}
        >
          <p>
            These monthly reference statistics are explained here, not
            calculated by the current frontend. A real implementation must
            define valid years and handle missing observations; the sample
            spread requires nₘ ≥ 2.
          </p>
        </Equation>
      </MethodSection>
      <MethodSection
        id="seasonal-z-score"
        title="Seasonal z-score"
        status="EXPLAINED HERE · NOT COMPUTED IN THIS FRONTEND"
      >
        <Equation
          id="z-score-equation"
          title="Distance from a monthly mean"
          expression={String.raw`Z(y,m)=\frac{X(y,m)-\mu_m}{s_m}`}
          variables={[
            {
              symbol: "X(y,m)",
              meaning: "Activity for the selected year and month.",
            },
            {
              symbol: "μₘ",
              meaning: "Mean of a defined same-month historical reference.",
            },
            {
              symbol: "sₘ",
              meaning:
                "Sample standard deviation of that reference, using denominator nₘ − 1.",
            },
          ]}
        >
          <p>
            A score of +2 means two reference standard deviations above the
            mean. At least two valid reference values and positive spread are
            necessary; a scientifically useful baseline needs substantially
            more, with stable sampling and adequate coverage. Zero variance or
            insufficient history makes the score unavailable, not zero.
          </p>
        </Equation>
        <p>
          Use of the symbol σ for a population standard deviation is also
          common; here s denotes an estimated sample spread. A z-score is not a
          probability unless additional distributional assumptions are
          justified. The offline Python pipeline is integrated through exported
          data tiles. This seasonal z-score is methodological context, not a
          currently displayed indicator.
        </p>
      </MethodSection>
      <MethodSection
        id="robust-anomalies"
        title="Robust anomalies"
        status="LOCAL DAILY MAD RULE · IMPLEMENTED; MONTHLY ROBUST Z-SCORE · NOT IMPLEMENTED"
      >
        <Equation
          id="mad-equation"
          title="The implemented daily neighbourhood rule"
          expression={String.raw`b_d=\operatorname{median}(N_d),\quad S_d=1.4826\operatorname{median}_{x\in N_d}|x-b_d|`}
          variables={[
            {
              symbol: "Nᴅ",
              meaning:
                "Available daily indices within 10 days before and after d, excluding d; clipped at record edges.",
            },
            {
              symbol: "bᴅ",
              meaning: "Local median daily index, stored as expected activity.",
            },
            {
              symbol: "Sᴅ",
              meaning:
                "Scaled median absolute deviation of those neighbouring indices.",
            },
          ]}
        >
          <p>
            The factor 1.4826 is a normal-consistency convention for MAD, not
            evidence that these fire-activity indices are normally distributed.
          </p>
        </Equation>
        <Equation
          id="daily-flag-equation"
          title="All three conditions must hold"
          expression={String.raw`I_d\geq0.22,\qquad I_d\geq2b_d,\qquad I_d>b_d+\max(0.15,4S_d)`}
          variables={[
            {
              symbol: "Iᴅ",
              meaning: "Daily harmonized index on its internal 0–1 scale.",
            },
          ]}
        >
          <p>
            The 0.22 floor, 2× median condition and 0.15 / 4× spread margins are
            provisional heuristic thresholds. This rule compares neighbouring
            days, not the same month across years, and is not a significance
            test or monthly robust z-score.
          </p>
        </Equation>
        <DailyEvidence />
      </MethodSection>
      <MethodSection
        id="percentiles"
        title="Historical percentiles"
        status="SEASONAL PERCENTILE RANK · NOT IMPLEMENTED"
      >
        <p>
          A same-month percentile places a value relative to a reference
          distribution for that calendar month. Tie handling, reference period
          and quantile convention must be specified. A short record gives poor
          resolution in the tails; a rank of first among a few years does not
          establish a precise 99th percentile.
        </p>
        <p>
          The frontend’s historical rank is an ordinal rank, not a percentile.
          The Python reference calendar separately computes p25/p75 and an
          empirical percentile with midpoint treatment of ties; those are not
          currently displayed in the frontend. Its 95th-percentile daily
          normalizer and 98th-percentile colour reference are separate,
          non-seasonal quantities and must not be read as seasonal percentile
          ranks.
        </p>
      </MethodSection>
      <MethodSection
        id="unusual-cells"
        title="Unusually high cells on the map"
        status="HELD-OUT SAME-MONTH RANK PER CELL · IMPLEMENTED"
      >
        <p>
          On the map, a 0.25° cell glows when its month is unusually high for
          that cell and that calendar month. The glow is a screening aid: it
          shows where to look, not a detected event.
        </p>
        <Equation
          id="unusual-cells-equation"
          title="Rank of a cell-month among the other reference years"
          expression={String.raw`U_{c,y,m}=\Big[\,\tilde X_{c,y,m}\ge ${UNUSUAL_FLOOR}\ \wedge\ \#\{\,r\in R\setminus\{y\}:X_{c,r,m}<\tilde X_{c,y,m}\}\ \ge\ ${UNUSUAL_SHARE}\,\lvert R\setminus\{y\}\rvert\,\Big]`}
          variables={[
            {
              symbol: "Xc,r,ₘ",
              meaning:
                "MODIS Aqua hot spots observed in cell c, reference year r, calendar month m.",
            },
            {
              symbol: "R",
              meaning: `The reference years, ${meta.climatologyBase[0]}–${meta.climatologyBase[1]}. The year being judged is left out, so 22 years remain for a year inside the reference and 23 for a year outside it.`,
            },
            {
              symbol: "X̃c,y,ₘ",
              meaning: `The value judged. Through ${meta.observedUntil} it is the observed MODIS Aqua total. After that the count is not observed; see the modeled months below.`,
            },
            {
              symbol: "Uc,y,ₘ",
              meaning:
                "True when the cell glows: the value reaches the floor and is strictly higher than at least 90% of the other reference years.",
            },
          ]}
        >
          <p>
            In practice a cell glows when at most two of the other reference
            years reached its value. This is an ordinal rank with a stated
            threshold; it is not an estimate of a 90th percentile, which a
            record of 23 years cannot resolve precisely.
          </p>
        </Equation>
        <ul>
          <li>
            <strong>The judged year is held out.</strong> A year compared with
            a threshold it helped to set exceeds it less often than a year
            outside the reference, which would make {meta.climatologyBase[0]}–
            {meta.climatologyBase[1]} and later years incomparable.
          </li>
          <li>
            <strong>A rank, not a fitted distribution.</strong> Counts per cell
            are skewed and often zero, so a mean and a standard deviation would
            mislead. Ties do not count as higher.
          </li>
          <li>
            <strong>A floor of {UNUSUAL_FLOOR} hot spots.</strong> In a cell
            that rarely burns, one or two detections outrank every other year.
            The floor removes such faint signals. It is a judgement threshold,
            not a statistical one.
          </li>
          <li>
            <strong>Modeled months are judged by probability.</strong> After{" "}
            {meta.observedUntil} the count MODIS Aqua would have recorded in a
            cell is not observed. The harmonization gives its distribution: a
            negative binomial with the stored mean and variance of that cell
            and month. From it comes the probability that the count would pass
            the test above. A cell glows when that probability is at least{" "}
            {UNUSUAL_PROBABILITY * 100}%. The symmetric 95% range shown for an
            area is not used here: in a single cell the distribution is so
            skewed that the low end of that range is zero.
          </li>
          <li>
            <strong>Many cells are judged at once.</strong> Even in an ordinary
            year a cell passes the rank test about one time in eight (three
            ranks out of 23 or 24), before the floor. The map key therefore
            gives the number of unusual cells next to the number that is
            typical for that calendar month: the median, over the reference
            years, of the count obtained with this same rule. For a modeled
            month the number is the expected one, the sum of the cells’
            probabilities. A lone glowing cell means little; a count far above
            the typical one, or a cluster, means more.
          </li>
        </ul>
        <p>
          <strong>Check of the modeled rule.</strong> From April 2018 the
          files hold both the observed MODIS Aqua count and the harmonized
          value, so the modeled rule can be tried on months where the answer
          is known. Over every cell of Brazil, for February, May, August,
          September, October and November of 2019–2023, MODIS Aqua recorded
          12,485 unusual cell-months and the rule expected 12,519. Of the
          cells that would have glowed, 77% were unusual; they are 43% of all
          the unusual ones. The expected number is therefore reliable, while
          the glow marks the likeliest cells and misses the others. This check
          rebuilds the variance from the mean, because the per-cell variance is
          shipped for modeled months only, and it uses years the harmonization
          was fitted on. It runs with the project’s tests
          (<code>src/lib/unusual.validation.test.ts</code>).
        </p>
        <p>
          Limits: the reference is fixed, so a place where fire has been
          increasing glows more often in recent years; neighbouring cells are
          not independent, so clusters are expected; a month in progress is
          compared with complete months and can only be under-flagged; single
          days are not judged. Clouds and Aqua outages lower some reference
          values. Aqua’s overpass time has been drifting: its observed
          counts of 2024 and 2025 run about 15% above the nominal scale, so
          those two years glow somewhat more easily than earlier ones, and the
          modeled months that follow are back on the nominal scale.
        </p>
      </MethodSection>
      <MethodSection id="example" title="Interpreting results">
        <figure className="method-example">
          <figcaption>
            <strong>
              Fictional teaching example — not observations or application
              output
            </strong>
            <p>
              Five reference-year totals for the same month: 40, 60, 80, 100 and
              120 Aqua-equivalent hot spots. A separate illustrative target year
              has 160.
            </p>
          </figcaption>
          <div className="example-bars" aria-hidden="true">
            <div>
              <span>Reference mean</span>
              <i style={{ width: "50%" }} />
              <b>80</b>
            </div>
            <div>
              <span>Target year</span>
              <i style={{ width: "100%" }} />
              <b>160</b>
            </div>
          </div>
          <dl>
            <div>
              <dt>Mean / median</dt>
              <dd>80 / 80 Aqua-equivalent hot spots</dd>
            </div>
            <div>
              <dt>Sample standard deviation</dt>
              <dd>√1000 ≈ 31.62 Aqua-equivalent hot spots</dd>
            </div>
            <div>
              <dt>Departure / ratio to median</dt>
              <dd>+80 Aqua-equivalent hot spots / 2×</dd>
            </div>
            <div>
              <dt>Illustrative z-score</dt>
              <dd>(160 − 80) / 31.62 ≈ +2.53</dd>
            </div>
          </dl>
          <p>
            The target exceeds all five reference values; no precise extreme
            percentile is inferred. This example holds out the target to explain
            a seasonal reference. The current frontend’s monthly baseline
            uses 2003–2025, including the selected year only when it belongs to that reference period.
          </p>
        </figure>
      </MethodSection>
      <MethodSection id="interpretation" title="Scientific interpretation">
        <ul>
          <li>
            An anomaly describes unusual activity relative to a chosen baseline;
            it does not predict future fire.
          </li>
          <li>
            Hot spots are thermal pixels, not independent incidents or
            burned-area measurements.
          </li>
          <li>
            Z-scores and heuristic flags are not probabilities or causal
            explanations.
          </li>
          <li>
            Harmonization quality, missing observations and small samples affect
            every historical comparison.
          </li>
        </ul>
      </MethodSection>
      <References ids={["scale", "outliers", "mad", "heldout"]} />
    </>
  );
}
