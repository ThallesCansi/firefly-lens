import { fireData } from "@/lib/data/source";
import { MethodSection } from "./MethodSection";
import { References } from "./References";

export function DataGuide() {
  return (
    <>
      <div className="method-panel-heading">
        <p className="eyebrow">03 / KNOW THE EVIDENCE</p>
        <h2>Data Sources, Validation &amp; Limitations</h2>
        <p>
          What this build actually uses, what it can tell you, and what remains
          unvalidated.
        </p>
      </div>
      <MethodSection id="data-sources" title="Data sources">
        <div className="method-callout">
          <strong>
            {fireData.simulated
              ? "This build uses simulated detections."
              : "Inspect the active source adapter before interpreting observations."}
          </strong>
          <p>
            Records are deterministic and shaped like FIRMS data. They are not
            downloaded NASA observations, and simulated activity is not evidence
            about a real place.
          </p>
        </div>
        <p>
          <a href="https://firms.modaps.eosdis.nasa.gov/content/active_fire/">
            NASA FIRMS
          </a>{" "}
          distributes satellite active-fire data. The intended real inputs are
          MODIS Collection 6.1 active fire, nominally 1 km, and VIIRS I-band
          active fire, nominally 375 m. No real dataset collection has been
          ingested in this repository.
        </p>
        <p>
          The simulated source partitions the world into 4° tiles, with seasonal
          patterns, yearly variation, simulated cloud effects, sensor-dependent
          detections and planted bursts. Those mechanisms exercise the interface
          and tests; they do not reproduce all observational biases.
        </p>
      </MethodSection>
      <MethodSection id="coverage" title="Data coverage">
        <p>
          The current source serves {fireData.firstYear}–{fireData.lastYear}.
          MODIS began reporting before this simulated record; VIIRS is enabled
          in this code from 20 January 2012. These are availability gates, not
          proof of an observation on every day or uniform coverage of every
          region.
        </p>
        <p>
          Different satellites join at different dates. Additional overpasses
          change sampling; Terra-only early years are not directly comparable to
          a larger later fleet without evaluation. Source availability and
          product versions must be checked for a real-data deployment.
        </p>
        <p>
          Clouds and missing overpasses are not modelled as explicit missing
          values by the harmonizer: absent detections become zeros. A quiet map
          therefore cannot establish absence of burning.
        </p>
      </MethodSection>
      <MethodSection id="hotspot" title="What is a hotspot?">
        <p>
          A satellite hot spot is a thermal anomaly detected within a sensor
          pixel at an acquisition time. One pixel can contain multiple fires;
          one event can generate many pixels and repeated detections. Other
          thermal sources can also be detected.
        </p>
        <dl className="method-definitions">
          <div>
            <dt>Detected hot spots</dt>
            <dd>Sensor observations, not a count of distinct incidents.</dd>
          </div>
          <div>
            <dt>Independent fires</dt>
            <dd>
              Events requiring additional spatial/temporal grouping and
              validation; not identified here.
            </dd>
          </div>
          <div>
            <dt>Burned area</dt>
            <dd>
              Surface area affected by fire; not derived by counting active-fire
              pixels.
            </dd>
          </div>
          <div>
            <dt>Future risk</dt>
            <dd>
              A predictive assessment; not provided by this historical explorer.
            </dd>
          </div>
        </dl>
      </MethodSection>
      <MethodSection id="frp" title="Fire radiative power">
        <p>
          FRP estimates a rate of radiative energy release, reported in
          megawatts, not total energy. The day-detail table sums reported FRP
          values per sensor across detections. That sum is not an integrated
          fire-energy estimate, a unique-event intensity, or a directly
          comparable sum across sensor fleets. FRP does not enter the harmonized
          activity index.
        </p>
      </MethodSection>
      <MethodSection id="limitations" title="Limitations">
        <ul>
          <li>
            <strong>Clouds and coverage:</strong> obscuration or a missed
            overpass can look like inactivity. Missingness is not separated from
            zero.
          </li>
          <li>
            <strong>Resolution and sensitivity:</strong> grid aggregation
            reduces repeated pixel counts but cannot make sensor detection
            capabilities equivalent.
          </li>
          <li>
            <strong>Overpass timing:</strong> acquisition times are retained but
            not used to align observations. Short events may be sampled
            differently.
          </li>
          <li>
            <strong>Satellite fleet:</strong> changes in the number of
            satellites and revisit frequency are not corrected; early MODIS
            years can read low.
          </li>
          <li>
            <strong>Confidence:</strong> confidence is recorded and displayed,
            but not used as a filter or weight.
          </li>
          <li>
            <strong>Calibration:</strong> one area-specific factor is used for
            all seasons and years. It may drift with fire size, land cover,
            geometry or sampling.
          </li>
          <li>
            <strong>Reference uncertainty:</strong> small or incomplete
            historical samples make ranks, medians and extreme quantiles
            unstable. Neither uncertainty intervals nor real-data accuracy
            scores are supplied.
          </li>
          <li>
            <strong>Spatial and temporal scale:</strong> degree-based cells
            change area with latitude; daily and monthly aggregation hides
            within-day variation. The capped index hides variation above the
            reference.
          </li>
          <li>
            <strong>Scope:</strong> the app describes detected thermal activity.
            It is not a risk, severity, emissions, burned-area or
            emergency-response product.
          </li>
        </ul>
      </MethodSection>
      <MethodSection id="provenance" title="Data provenance">
        <dl className="method-definitions">
          <div>
            <dt>Active source</dt>
            <dd>
              Local deterministic simulation via FireDataSource / mockSource.
            </dd>
          </div>
          <div>
            <dt>Dataset version</dt>
            <dd>
              No NASA dataset version applies to these generated records. A
              generator release identifier is not currently exposed.
            </dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>
              {fireData.firstYear}–{fireData.lastYear}, with the sensor gates
              described above.
            </dd>
          </div>
          <div>
            <dt>Update date</dt>
            <dd>
              No observational acquisition/update timestamp; records are
              generated on request.
            </dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>
              0.05° per-sensor daily grid, overlap-ratio calibration, common
              series, relative index and monthly/local comparisons.
            </dd>
          </div>
        </dl>
        <p>
          Replacing the simulation requires implementing FireDataSource.
          Historical observations are expected from archives; recent
          observations may use an appropriately configured server-side API.
          There is no connected Python module in the repository inspected for
          this phase.
        </p>
      </MethodSection>
      <MethodSection id="status" title="Validation status">
        <div className="method-table-wrap">
          <table>
            <caption>Current capabilities and evidence</caption>
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
                  Map exploration, area selection, simulated records,
                  provisional harmonization, monthly median/rank, local MAD
                  flags and exports.
                </td>
              </tr>
              <tr>
                <th scope="row">Tested on simulations</th>
                <td>
                  Determinism, bounds, sensor gates, index range, synthetic
                  continuity, seasons and planted bursts. This is not external
                  scientific validation.
                </td>
              </tr>
              <tr>
                <th scope="row">Validation pending</th>
                <td>
                  Calibration and thresholds against real observations;
                  coverage, fleet and sensitivity effects; independent reference
                  comparisons.
                </td>
              </tr>
              <tr>
                <th scope="row">Planned / not integrated</th>
                <td>
                  Real FIRMS archives/API, coverage-aware processing, monthly
                  z-scores, seasonal percentile ranks and external Python
                  results.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          FireFly Lens is a NASA Space Apps Challenge 2026 project. It is not
          endorsed by NASA. No fictional progress percentages or validation
          results are presented.
        </p>
      </MethodSection>
      <References ids={["firms", "modis", "viirs", "scale", "outliers"]} />
    </>
  );
}
