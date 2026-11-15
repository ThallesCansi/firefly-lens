export const TOUR_PERIOD = "2023-09";
export interface TourStep {
  id: string;
  target?: string;
  title: string;
  description: string;
}
export const TOUR_STEPS = [
  { id: "welcome", title: "Hi, I’m FireFlighter", description: "Let’s explore real satellite records together in a read-only demonstration. I’ll prepare the controls as you choose Next or Back. We’ll visit the Pantanal in September 2023. Your workspace is saved; skip at any time or restore it when we finish." },
  { id: "map", target: "map-controls", title: "Explore the map", description: "Outside this demonstration, these controls pan, zoom and switch between globe and flat views. Moving the camera does not select an analysis area. The workspace stays read-only while I guide you." },
  { id: "search", target: "search", title: "Find a place", description: "Search finds a Brazilian city and selects it as the analysis area, with its official outline; any other place or coordinates only move the camera. You can use it after the tour. No search request is needed for our demonstration." },
  { id: "region", target: "presets", title: "Select a region", description: "Coordinates contains the existing study regions. You can also draw an area or pick a state. Next will select the exact Pantanal preset for our demonstration." },
  { id: "pantanal", target: "selection", title: "Try the Pantanal", description: "This is the Pantanal study region, drawn with IBGE’s official Pantanal biome outline. Analysis weights each grid cell by its overlap with this exact geometry. Your previous selection is saved." },
  { id: "sensors", target: "sensors", title: "Two sensors, different pixels", description: "These switches show raw MODIS Aqua and VIIRS NOAA-20 detections on the map. Their pixels differ: adding their raw counts does not count independent fires. You can toggle layers after the tour." },
  { id: "period", target: "period", title: "Choose a month and year", description: "I’ve prepared September 2023, a complete observed Aqua month with VIIRS available. The month and year controls will be available for your own exploration when the demonstration ends." },
  { id: "analyze", target: "analyze", title: "Read this area’s history", description: "Outside this tour, selecting an area opens its real historical record at once. Show analysis brings it back after it is closed. Choose Next and I’ll invoke the existing analysis action. Loading may take a moment." },
  { id: "history", target: "history", title: "A calendar of historical months", description: "Each square is a month on the MODIS Aqua scale. Rings compare months with their historical medians; dots identify modeled VIIRS values. These historical descriptions are not predictions. Next opens September 2023." },
  { id: "month", target: "month", title: "Inside September 2023", description: "These are the real days of our example month. After the tour, selecting a day coordinates the map and details. Daily unusual-activity flags use nearby days; they differ from historical monthly anomalies." },
  { id: "report", target: "report-heading", title: "The report continues below", description: "Full report below brings you here using the existing navigation. This report contains scientific analytics, the full calendar, sensor comparisons and downloads." },
  { id: "science", target: "analytics-history", title: "Understand the historical record", description: "History shows the prepared Python analysis for this exact region: historical totals, seasonal references and anomalies. Browser calendar references and Python quality policies differ. A modeled estimate or descriptive trend is not a validated forecast." },
  { id: "forecast", target: "analytics-forecast", title: "An experimental outlook", description: "Forecast uses the latest complete origin, not a forecast issued in September 2023. It is a separate experimental analysis with model performance and uncertainty. Availability depends on this exact geometry and validation. Another region’s forecast is never substituted." },
  { id: "range", target: "range", title: "Choose the export period", description: "I’ve prepared January–December 2023. The range applies to historical views and downloads. Grid-cell exports support at most 36 months. These controls become editable when the tour ends." },
  { id: "exports", target: "exports", title: "Take the evidence with you", description: "After the tour you can export daily or monthly CSV, grid-cell counts, the heatmap SVG, or the area geometry. Export buttons stay locked during this demonstration; no file will be downloaded." },
  { id: "pages", target: "site-links", title: "Two more pages to see", description: "The Lens is one of three pages. About tells the project’s story and Method holds the science notes. Choose Next and I’ll fly you over both, then bring you back here to finish. Your workspace stays saved." },
  { id: "complete", title: "You’re ready to explore", description: "Keep the Pantanal example, restore your previous workspace, or replay with me. Detected thermal pixels are not independent fires. Historical anomalies and experimental forecasts have different meanings and limitations." },
] as const satisfies readonly TourStep[];
export type TourStepId = typeof TOUR_STEPS[number]["id"];
export const stepIndex = (id: TourStepId) => TOUR_STEPS.findIndex((step) => step.id === id);

/** A stop of the tour on the content pages: `target` is a CSS selector there. */
export interface PageTourStep { target: string; title: string; description: string }
export type TourPage = "about" | "method";
export const PAGE_TOUR: Record<TourPage, readonly PageTourStep[]> = {
  about: [
    { target: "#hero-title", title: "Welcome to About", description: "This page tells the Lens’s story from the beginning: why one shared fire calendar for South America is worth building, and who it is for." },
    { target: "#sensors-title", title: "Two satellites, two eyes", description: "MODIS Aqua has watched since 2002 with 1 km pixels; VIIRS NOAA-20 joined in 2018 with sharper 375 m pixels. Here you see why their raw counts cannot simply be added." },
    { target: "#harmonize-title", title: "Making them comparable", description: "This section shows, with a worked example, how VIIRS detections are carried onto the MODIS Aqua scale so twenty-plus years read as one record." },
    { target: "#data-title", title: "Where the data comes from", description: "NASA FIRMS and the other sources, with their credits. Choose Next and I’ll take you to Method, the science notes." },
  ],
  method: [
    { target: ".method-intro h1", title: "The science behind the Lens", description: "Method documents what is implemented: every formula, the validation results and the limitations, clearly separated from planned work." },
    { target: ".method-tablist", title: "Four chapters", description: "Harmonization, historical anomalies, data and limitations, and fire danger. Each tab opens one chapter, with equations and the evidence behind them." },
    { target: ".method-notice", title: "What this build covers", description: "The exact period and regions of the current data. Choose Next and I’ll fly you back to the Lens to finish." },
  ],
};
/** Lens steps before the visit, the pages' stops, then the Lens's last step. */
export const TOUR_TOTAL = TOUR_STEPS.length + PAGE_TOUR.about.length + PAGE_TOUR.method.length;
/** The number a step shows ("12 of 24"), counting the page visit before the last step. */
export function tourNumber(where: { lens: number } | { page: TourPage; index: number }): number {
  if ("lens" in where) return where.lens === TOUR_STEPS.length - 1 ? TOUR_TOTAL : where.lens + 1;
  return TOUR_STEPS.length - 1 + (where.page === "method" ? PAGE_TOUR.about.length : 0) + where.index + 1;
}
