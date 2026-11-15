import type { AnomalyRow, MonthlyRow } from "./contracts";

/** Wording only: all reference statistics and quality gates come from Python. */
export function describeMonth(month?: MonthlyRow, anomaly?: AnomalyRow): string {
  if (!month || month.value === null) return "No activity value is available for this month.";
  if (!month.complete) return "This month is incomplete. Wait for the complete record before comparing it with past years.";
  const subject = month.source === "modeled_viirs" ? "Estimated fire activity" : "Fire activity";
  if (!anomaly || !["available", "partially_available"].includes(anomaly.status))
    return `${subject} is available, but there is not enough eligible history for a seasonal comparison.`;
  if ((anomaly.percentile !== null && anomaly.percentile >= 90) ||
      (anomaly.z_score !== null && anomaly.z_score >= 2))
    return `${subject} was unusually high compared with the historical pattern for this month.`;
  if (anomaly.percent === null) return `${subject} has no supported percentage comparison for this month.`;
  if (anomaly.percent === 0) return `${subject} matched the historical average for this month.`;
  return `${subject} was ${Math.abs(anomaly.percent).toLocaleString("en", { maximumFractionDigits: 1 })}% ${anomaly.percent > 0 ? "above" : "below"} the average for the same month in eligible past years.`;
}

export function describeForecastLimit(reason: string | null): string {
  if (reason === "latest_eligible_observation_does_not_reach_forecast_origin")
    return "Recent months cannot support this activity forecast: MODIS observations after 2023 are affected by orbital drift, and harmonized VIIRS estimates are not eligible training observations. Historical model tests remain available below.";
  return "The selected region does not yet meet the model’s validation requirements for a current activity forecast.";
}
