import { fireData } from "@/lib/data/source";
import { meta } from "@/lib/data/meta";
import { MethodSection } from "./MethodSection";
import { References } from "./References";
import { LIMITS } from "./RealDataNotes";
import { QualityEvidence } from "./MethodEvidence";

export function DataGuide() {
  return (
    <>
      <div className="method-panel-heading">
        <p className="eyebrow">03 / KNOW THE EVIDENCE</p>
        <h2>Data Sources, Validation &amp; Limitations</h2>
        <p>
          Real observations, modeled continuation, and the boundaries of their
          interpretation.
        </p>
      </div>
      <MethodSection id="data-sources" title="Data sources">
        <div className="method-callout">
          <strong>Real NASA FIRMS data for Brazil.</strong>
          <p>
            The record combines observed MODIS Aqua through {meta.observedUntil}{" "}
            and harmonized VIIRS NOAA-20 after that year. Modeled values are
            identified separately from observations; this is not the earlier
            simulated build.
          </p>
        </div>
        <p>
          <a href="https://firms.modaps.eosdis.nasa.gov/content/active_fire/">
            NASA FIRMS
          </a>{" "}
          country archives and the area API supply MODIS Collection 6.1 Aqua and
          VIIRS NOAA-20 records. IBGE biomes and Brazil’s outline are obtained
          through geobr. Terra, Suomi NPP and NOAA-21 are excluded.
        </p>
        <p>
          Confidence, vegetation-fire and duplicate filters are applied offline.
          The browser receives aggregate cells and days, not individual
          detections or every original FIRMS attribute.
        </p>
      </MethodSection>
      <MethodSection id="background-imagery" title="Background satellite imagery">
        <p>
          <strong>EOxCloudless Sentinel-2 2025</strong> is the default map background.
          NASA GIBS Blue Marble remains available under Camera → Satellite source.
          These images provide geographic context; they are separate from the
          MODIS/VIIRS thermal-detection datasets used in fire analyses.
        </p>
        <p>
          The 2025 mosaic is independent of the selected fire-analysis period.
          Imagery can contain seasonal variation, shadows, mosaic seams and
          display color adjustments. Its appearance does not validate detection
          counts, harmonization or forecasts.
        </p>
        <p>
          <a href="https://cloudless.eox.at">EOxCloudless</a> by{" "}
          <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified
          Copernicus Sentinel data 2025). Eligible non-commercial use is subject to{" "}
          <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>{" "}
          and the <a href="https://cloudless.eox.at/documentation/license">EOX licensing conditions</a>.
        </p>
        <p>
          Open the map’s attribution control (ⓘ) for provider credits. Before
          capturing or sharing a screenshot containing EOX imagery, expand the
          credits and keep them visible in the image. Images and videos containing
          this imagery require embedded attribution. The scientific CSV and chart
          exports do not contain the satellite background.
        </p>
      </MethodSection>
      <References ids={["eox", "eox-license", "cc-nc-sa"]}
        title="Background imagery sources and licensing"
        description="Provider documentation and usage terms for geographic context imagery." />
      <MethodSection id="coverage" title="Data coverage">
        <p>The dates below describe the original spatially calibrated Brazilian tiles. Additional South American countries have separate whole-country reports for July 2002–December 2025, documented under <a href="/method#geographic-expansion">Geographic expansion</a>. They do not extend the Brazilian cell calibration across borders.</p>
        <p>
          Current metadata spans {fireData.firstDay} to {fireData.lastDay},
          restricted to Brazil. VIIRS NOAA-20 begins {fireData.viirsStart}. The
          last complete month is {meta.seriesEnd}; {meta.partialMonth} is
          partial. Same-month medians use {meta.climatologyBase[0]}–
          {meta.climatologyBase[1]}.
        </p>
        <p>
          Dates describe the available files, not uniform observation coverage.
          Clouds, overpass timing and Aqua outages can produce missing
          detections. Missingness is not explicitly separated from zero in every
          displayed daily value. Near-real-time and standard-processing records
          have different limitations.
        </p>
      </MethodSection>
      <MethodSection id="data-quality" title="Quality of this data snapshot" status="INDEPENDENT FILE AUDIT · SCIENTIFIC LIMITS REMAIN">
        <QualityEvidence />
      </MethodSection>
      <MethodSection id="hotspot" title="What is a hotspot?">
        <p>
          A thermal anomaly detected in a satellite pixel at an acquisition
          time. One fire can yield many pixels and repeat detections; one pixel
          can contain several fires. Counts are not independent incidents or
          burned-area measurements.
        </p>
        <dl className="method-definitions">
          <div>
            <dt>Map markers</dt>
            <dd>
              Counts aggregated per 0.25° cell, with separate sensor scales; not
              individual fire locations.
            </dd>
          </div>
          <div>
            <dt>Harmonized counts</dt>
            <dd>
              MODIS-Aqua-equivalent observations or modeled estimates, not a
              unique-event count.
            </dd>
          </div>
          <div>
            <dt>Burned area</dt>
            <dd>
              Requires a separate area-mapping product; not calculated here.
            </dd>
          </div>
          <div>
            <dt>Future risk</dt>
            <dd>
              Requires predictive modelling; not provided by this historical
              explorer.
            </dd>
          </div>
        </dl>
      </MethodSection>
      <MethodSection id="frp" title="Fire radiative power">
        <p>
          FRP is a radiative energy release rate in megawatts, not integrated
          energy or future risk. The current static browser tiles do not carry
          FRP, so the interface does not display it or use it in the activity
          index. Do not infer FRP from map-marker size.
        </p>
      </MethodSection>
      <MethodSection id="limitations" title="Limitations">
        <ul>
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
          <li>
            Spatial aggregation and VIIRS degradation reduce pixel multiplicity
            but cannot eliminate sensor sensitivity, coverage or timing
            differences. Degree-based cells vary in physical area with latitude.
          </li>
          <li>
            Monthly modeled totals are allocated to days for display. Daily
            anomaly flags are heuristic, not significance tests or fire
            forecasts.
          </li>
          <li>
            Short or incomplete historical references weaken ranks and tail
            estimates; no seasonal z-score is currently displayed.
          </li>
        </ul>
      </MethodSection>
      <MethodSection id="provenance" title="Data provenance">
        <dl className="method-definitions">
          <div>
            <dt>Source</dt>
            <dd>{meta.sources}</dd>
          </div>
          <div>
            <dt>App data format</dt>
            <dd>
              Version {meta.version}; {meta.cellDeg}° grid, stored in static
              gzip-compressed tiles.
            </dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>
              {meta.firstDay} to {meta.lastDay}; current partial month:{" "}
              {meta.partialMonth}.
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>
              Observed MODIS Aqua through {meta.observedUntil}; modeled VIIRS
              continuation afterward. Climatology:{" "}
              {meta.climatologyBase.join("–")}.
            </dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>
              Offline Python harmonization and tile export, then area-weighted
              aggregation in the browser.
            </dd>
          </div>
          <div>
            <dt>Update timestamp</dt>
            <dd>
              No separate dataset update timestamp is supplied by the metadata.
              The final acquisition date and SVG export timestamp are distinct.
            </dd>
          </div>
        </dl>
        <p>
          <a href="https://github.com/ThallesCansi/firefly-lens/tree/main/harmonization">
            Pipeline and reproduction instructions ↗
          </a>
          . The browser uses its exported data; it does not invoke a live Python
          service.
        </p>
      </MethodSection>
      <MethodSection id="status" title="Validation status">
        <div className="method-table-wrap">
          <table>
            <caption>Implemented capabilities and evidence</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Scope</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Implemented</th>
                <td>
                  Real Brazil data tiles, offline NB2 calibration,
                  observed/modeled series, intervals, area aggregation,
                  median/rank, local MAD flags and exports.
                </td>
              </tr>
              <tr>
                <th scope="row">Validated in the pipeline</th>
                <td>
                  Leave-one-year-out calibration-period results and
                  out-of-sample comparisons, with committed metrics and
                  limitations. These do not guarantee every small-area estimate.
                </td>
              </tr>
              <tr>
                <th scope="row">Not displayed in the frontend</th>
                <td>
                  Seasonal z-score and same-month percentile ranks. The Python
                  reference calendar separately supplies p25/p75 and an
                  empirical percentile.
                </td>
              </tr>
              <tr>
                <th scope="row">Future work</th>
                <td>
                  Replace NRT tail with standard processing, address Aqua
                  drift/outages and extend geographic coverage.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          FireFly Lens is a NASA Space Apps Challenge 2026 project and is not
          endorsed by NASA.
        </p>
      </MethodSection>
      <References ids={["firms", "modis", "viirs", "scale", "outliers"]} />
    </>
  );
}
