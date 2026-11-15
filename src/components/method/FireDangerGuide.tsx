import { MethodSection } from "./MethodSection";
import { Equation } from "./Equation";

export function FireDangerGuide() {
  return <>
    <div className="method-panel-heading">
      <p className="eyebrow">04 / WEATHER AND EXPOSURE</p>
      <h2>Fire Danger &amp; Risk Assessment</h2>
      <p>Weather-driven danger, historical activity and impacts answer different questions.</p>
    </div>
    <MethodSection id="fire-danger-risk" title="What the Canadian FWI System measures" status="Numeric provider adapter · availability depends on a verified source file">
      <p>The Canadian Forest Fire Weather Index System uses temperature, relative humidity, wind and 24-hour precipitation, normally referenced to local noon. Three moisture codes (FFMC, DMC and DC) describe different fuel layers; ISI describes initial spread potential and BUI describes available fuel. FWI combines ISI and BUI as a dimensionless indicator of potential fire intensity.</p>
      <p>FireFly Lens reads provider-calculated FWI. It does not implement the Canadian moisture-code recurrence, replace it with a visual score or infer weather from satellite hotspots.</p>
      <div className="method-callout"><strong>Danger is not complete risk.</strong><p>FWI is neither ignition probability nor a predicted number of fires. Risk to people and property additionally depends on ignition sources, fuel, exposure, vulnerability and response capacity.</p></div>
    </MethodSection>
    <MethodSection id="fwi-source" title="Numerical data and forecast interpretation">
      <p>The active real-data integration uses NASA GFWED/GEOS-5 experimental numeric forecasts, downloaded from NASA NCCS and subset to South America without interpolation. The imported native grid is 0.25° latitude × 0.3125° longitude. Original initialization, daily valid dates, input-file hashes and retrieval time are preserved. Prepared exact country/study-region assessments work without Python hosting; arbitrary polygons use the same Python raster reader.</p>
      <p>The NASA files encode a local-noon daily index with a non-absolute native time coordinate. Initialization and valid dates are decoded from the provider’s documented forecast product keys. A validity date is not converted into a fabricated UTC hour: the UI displays the daily date and lead in days. The initialization is the GEOS 00 UTC cycle; the exact publication instant is unavailable.</p>
      <p>The optional Copernicus CEMS seasonal FWI adapter remains available for operator-supplied downloads, driven by ECMWF SEAS5 through GEFF. The current EWDS catalogue describes a global land ensemble on a 1° regular grid with delayed monthly publication and up to 216 days lead. A live EWDS file has not been verified. Resolution is always read from the imported file.</p>
      <p>The operational Copernicus/GWIS forecast is a different product. NASA GFWED is explicitly experimental; the seasonal CEMS product is explicitly delayed. Members are never mixed, and expired validities are withheld. Cached assessments stop being available when their last supplied date expires; they require a new offline download, not a changed timestamp.</p>
      <p>NASA NCCS downloads are public HTTPS. EWDS downloads require a registered account, API token and manual acceptance of product terms. The server reads a verified NetCDF plus a provenance sidecar with source keys, SHA-256, retrieval time, meteorological source, licence and available model version. Native and normalized file hashes are distinct. The checksum verifies integrity, not provider authentication by itself. No credentials reach the browser.</p>
      <p>Regular latitude/longitude NetCDF grids and one initialization per file are supported. Absolute CEMS timestamps or the documented NASA daily product keys are required. Reduced Gaussian grids and ambiguous dates fail closed. WMS images never become numeric FWI. Missing, expired or invalid products produce an unavailable assessment.</p>
    </MethodSection>
    <MethodSection id="fwi-aggregation" title="Polygon weighting and spatial distribution">
      <p>Each cell footprint is intersected with the exact selected polygon, including holes. Areas use the WGS84 ellipsoid, with geographic edges densified to 0.1° before area evaluation. Regular cell edges are half a grid step from their centres. This assumes uniform FWI within each cell.</p>
      <Equation id="fwi-area-mean" title="FWI area-weighted mean and coverage" expression={String.raw`\bar F = \frac{\sum_{i\in V} A(P\cap C_i) F_i}{\sum_{i\in V} A(P\cap C_i)},\qquad c = \frac{\sum_{i\in V} A(P\cap C_i)}{A(P)}`} variables={[
        { symbol: "P", meaning: "Selected polygon" }, { symbol: "Cᵢ", meaning: "Grid-cell footprint" },
        { symbol: "Fᵢ", meaning: "Provider FWI in cell i" }, { symbol: "A", meaning: "WGS84 ellipsoidal area" },
      ]}>No valid area means an unavailable mean, never zero.</Equation>
      <p>V contains cells with finite, nonnegative FWI. Nulls are excluded from the mean and retained as missing coverage. Coverage uses the entire selected polygon as denominator, including area beyond the product. The highest valid cell and the fraction of the selected polygon in each danger class accompany the mean; the remaining area is explicitly missing. Times and ensemble members remain separate.</p>
      <p>Provider percentiles and climatological anomalies are currently unavailable in this reader. They are not reconstructed from hotspot climatology or inferred from absolute FWI.</p>
    </MethodSection>
    <MethodSection id="fwi-classes" title="GWIS meteorological danger classes">
      <div className="method-table-scroll"><table><caption>Dimensionless FWI · explicit boundary convention used in the reader</caption>
        <thead><tr><th>Class</th><th>FWI range</th></tr></thead>
        <tbody>{[["Low", "0 ≤ FWI < 11.2"], ["Moderate", "11.2 ≤ FWI < 21.3"], ["High", "21.3 ≤ FWI < 38"], ["Very high", "38 ≤ FWI < 50"], ["Extreme", "50 ≤ FWI ≤ 70"], ["Very extreme", "FWI > 70"]].map(([label, range]) => <tr key={label}><th>{label}</th><td>{range}</td></tr>)}</tbody>
      </table></div>
      <p>The GWIS table shares adjacent endpoints. This implementation assigns 11.2, 21.3, 38 and 50 to the higher class, and follows GWIS’s explicit “above 70” wording for Very extreme. These global classes are a common reporting convention, not a validation of local ecological impacts.</p>
    </MethodSection>
    <MethodSection id="geographic-expansion" title="Geographic expansion and scientific gates">
      <p>Brazil retains its original spatial/biome calibration. Paraguay, Argentina, Bolivia, Chile, Colombia, Ecuador, Guyana, Peru, Suriname, Uruguay and Venezuela now have country-wide harmonized reports for July 2002–December 2025. Each country has its own seasonal/day-night Level-1 coefficients; Brazilian parameters are not transferred. Only exact national outlines receive these reports; arbitrary subnational polygons are not given country totals.</p>
      <p>The national fit reuses the existing shrinkage estimator. Evaluation fits 2018–2021 and tests 2022–2023, excluding the documented August 2020/April 2022 Aqua outages. Predetermined project gates require at least 20 holdout months, absolute total bias ≤20%, WAPE ≤40%, Spearman ≥0.8, annual absolute bias ≤50% and lower MAE than raw VIIRS. Every published country passed these aggregate gates. They are project criteria, not universal ecological validation.</p>
      <Equation id="national-level1" title="Country-specific seasonal harmonization" expression={String.raw`k_{m,d}=\frac{\sum A_{m,d}+200k_d}{\sum V^{1km}_{m,d}+200},\qquad k_d=\frac{\sum_m A_{m,d}}{\sum_m V^{1km}_{m,d}},\qquad \widehat A_{m,d}=k_{m,d}V^{1km}_{m,d}`} variables={[
        { symbol:"A",meaning:"Observed MODIS Aqua country count" },{ symbol:"V¹ᵏᵐ",meaning:"NOAA-20 detections degraded to 0.01° subcells per day and day/night pass" },{ symbol:"m, d",meaning:"Month of year and day/night stratum within one country" },
      ]}>The final fit uses 2018–2023. Aqua is observed through 2023; VIIRS is converted from 2024 to avoid treating drifting Aqua as nominal observations.</Equation>
      <p>Ranges use 300 whole-year bootstrap refits (seed 42), summing day/night predictions before taking the 2.5th and 97.5th percentiles. These describe coefficient variability only: they exclude residual prediction error and are not validated 95% predictive coverage. Post-2023 transfer, local ecosystems and subnational patterns remain uncertain. The observed historical record now starts in July 2002, with eligible seasonal references from 2003–2023 and explicit per-month sample counts. Earlier observations do not enter the 2018–2023 sensor calibration.</p>
      <p>Country Signals use only eligible real national anomalies with sufficient past reference years and an interior representative marker. The marker represents the whole country, not a local fire alert. Current activity forecasts still require eligible observations reaching their origin; converted VIIRS is not relabeled as observed training truth. Retrospective experiments use the existing Python forecast models and only past-origin evidence.</p>
      <p>Coverage metadata distinguish real harmonized data, real raw detections, synthetic demonstration and no historical coverage. Synthetic demonstration is disabled; production analytics reject synthetic bundles. Only validated real seasonal anomalies may light Firefly Signals. FWI never changes those signals.</p>
    </MethodSection>
    <section className="method-references" aria-label="Fire danger references">
      <h2>Scientific references</h2>
      <ol>
        <li>Field, R. D. et al. (2015). <a href="https://doi.org/10.5194/nhess-15-1407-2015">Development of a Global Fire Weather Database.</a> Natural Hazards and Earth System Sciences, 15, 1407–1423. <a href="https://data.giss.nasa.gov/impacts/gfwed/">NASA GFWED data and experimental forecast documentation</a>.</li>
        <li>Van Wagner, C. E. &amp; Pickett, T. L. (1985). <a href="https://purl.org/INRMM-MiD/c-14026112">Equations and FORTRAN program for the Canadian Forest Fire Weather Index System.</a> Canadian Forestry Service, Forestry Technical Report 33.</li>
        <li>Di Giuseppe, F. et al. (2016). <a href="https://doi.org/10.1175/JAMC-D-15-0297.1">The Potential Predictability of Fire Danger Provided by Numerical Weather Prediction.</a> Journal of Applied Meteorology and Climatology, 55, 2469–2491. DOI: 10.1175/JAMC-D-15-0297.1.</li>
        <li>Di Giuseppe, F. et al. (2024). <a href="https://doi.org/10.1038/s41597-024-02948-3">Global seasonal prediction of fire danger.</a> Scientific Data, 11, 128. DOI: 10.1038/s41597-024-02948-3.</li>
        <li>Copernicus Emergency Management Service (2023, updated catalogue). <a href="https://doi.org/10.24381/cds.b9c753f1">Seasonal forecast of fire danger indices.</a> DOI: 10.24381/cds.b9c753f1.</li>
        <li>European Commission, JRC (living documentation). <a href="https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/fire-danger-forecast">GWIS fire danger forecast and classes</a>; <a href="https://ewds.climate.copernicus.eu/how-to-api">EWDS access requirements</a>.</li>
      </ol>
    </section>
  </>;
}
