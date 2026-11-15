import schema from "../../../analytics/schemas/result.schema.json";

export const SECTIONS = [
  "history",
  "climatology",
  "anomalies",
  "forecast",
  "fire_weather",
] as const;
export type Section = (typeof SECTIONS)[number];
export type Source = "observed_modis" | "modeled_viirs" | "missing" | "mixed";
export interface MonthlyRow {
  date: string;
  year: number;
  month: number;
  value: number | null;
  source: Source;
  complete: boolean;
  flags: string[];
  lower: number | null;
  upper: number | null;
  valid_for_reference: boolean;
  uncertainty_method: string | null;
}
export interface AnnualRow {
  year: number;
  total: number | null;
  complete: boolean;
  valid_months: number;
  valid_month_sum: number | null;
  yoy_percent: number | null;
}
export interface HistoryData {
  monthly: MonthlyRow[];
  annual: AnnualRow[];
  summary: {
    highest_year: number | null;
    highest_month: string | null;
    mean_of_valid_monthly_totals: number | null;
    median_of_valid_monthly_totals: number | null;
    trend: { slope_per_year: number | null; n_years: number };
  };
}
export interface ClimateRow {
  month: number;
  n_years: number;
  years_used: number[];
  status: string;
  reason: string | null;
  mean: number | null;
  median: number | null;
  std_sample: number | null;
  mad: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}
export interface ClimateData {
  months: ClimateRow[];
  reference: { start_year: number; end_year: number; min_years: number };
}
export interface AnomalyRow {
  date: string;
  value: number | null;
  source: Source;
  complete: boolean;
  status: string;
  quality_flags: string[];
  absolute: number | null;
  percent: number | null;
  z_score: number | null;
  robust_z: number | null;
  percentile: number | null;
  null_reasons: Record<string, string>;
  reference: {
    n_years: number;
    years_used: number[];
    operational_past_years_only: boolean;
  };
}
export interface Metric {
  n: number;
  origins: number;
  mae: number | null;
  rmse: number | null;
  mean_bias: number | null;
  interval_n: number;
  coverage95: number | null;
}
export type Model = "seasonal_median" | "seasonal_naive" | "sarima";
export interface Prediction {
  date: string;
  horizon: number;
  value: number | null;
  lower: number | null;
  upper: number | null;
  reason: string | null;
  interval_kind: "forecast" | null;
  interval_method: string | null;
}
export interface ForecastData {
  forecast_status: "experimental" | "not_validated" | "unavailable";
  reason: string | null;
  model: Model | null;
  forecast_origin: string;
  last_complete_observation_used: string | null;
  training_period: {
    start: string | null;
    end: string | null;
    valid_months: number;
  };
  predictions: Prediction[];
  limitations: string[];
  backtesting: {
    status: string;
    reason: string;
    selection_cutoff?: string;
    recommended_model?: Model | null;
    validation?: {
      paired_cases: number;
      metrics: Partial<Record<Model, Metric>>;
    };
    paired_by_horizon?: Record<
      string,
      { paired_cases: number; metrics: Partial<Record<Model, Metric>> }
    >;
  };
}
export interface WeatherData {
  status: string;
  reason: string | null;
  index: "FWI";
  forecasts: {
    issued_at: string;
    valid_at: string | null;
    lead_hours: number | null;
    valid_date?: string;
    lead_days?: number;
    member: string;
    value: number | null;
    sample_count: number;
    valid_samples: number;
  }[];
  aggregation?: string;
  source?: { url: string; doi?: string };
  limitations?: string[];
}
export interface Failure {
  status: "unavailable";
  reason: string;
  error_type?: string;
}
export interface Payload<T> {
  schema_version: "1.0.0";
  section: Section;
  region_id: string;
  period: { start: string; end: string };
  units: string;
  source: { synthetic: boolean; provenance: Record<string, unknown> };
  data_status: string;
  generated_at: string;
  method: Record<string, unknown>;
  geometry: unknown;
  limitations: string[];
  data: T | Failure;
}
export interface Bundle {
  schema_version: "1.0.0";
  region_id: string;
  geometry: unknown;
  sections: {
    history: Payload<HistoryData>;
    climatology: Payload<ClimateData>;
    anomalies: Payload<{ months: AnomalyRow[] }>;
    forecast: Payload<ForecastData>;
    fire_weather: Payload<WeatherData>;
  };
}
export const isFailure = (data: object): data is Failure =>
  "status" in data && data.status === "unavailable" && !("forecasts" in data);

// Interpreter for the keywords used by the engine's actual JSON Schema.
// Validation only: statistical formulas and model selection stay in Python.
type Rule = { [key: string]: unknown };
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function match(rule: Rule, value: unknown, path = "$"): void {
  const fail = (message: string): never => {
    throw new Error(`${path}: ${message}`);
  };
  if (typeof value === "number" && !Number.isFinite(value))
    fail("nonfinite number");
  if ("const" in rule && value !== rule.const) fail("unexpected constant");
  if (Array.isArray(rule.enum) && !rule.enum.includes(value))
    fail("unknown enum value");
  const types = typeof rule.type === "string" ? [rule.type] : rule.type;
  if (
    Array.isArray(types) &&
    !types.some((type) =>
      type === "null"
        ? value === null
        : type === "array"
          ? Array.isArray(value)
          : type === "object"
            ? object(value)
            : type === "integer"
              ? typeof value === "number" && Number.isInteger(value)
              : typeof value === type,
    )
  )
    fail("wrong type");
  if (typeof value === "number") {
    if (typeof rule.minimum === "number" && value < rule.minimum)
      fail("below minimum");
    if (typeof rule.maximum === "number" && value > rule.maximum)
      fail("above maximum");
  }
  if (typeof value === "string") {
    if (typeof rule.minLength === "number" && value.length < rule.minLength)
      fail("empty string");
    if (
      typeof rule.pattern === "string" &&
      !new RegExp(rule.pattern).test(value)
    )
      fail("invalid date/format");
    if (
      (rule.format === "date-time" || rule.format === "date") &&
      !Number.isFinite(Date.parse(value))
    )
      fail("invalid timestamp");
  }
  if (Array.isArray(value)) {
    if (typeof rule.minItems === "number" && value.length < rule.minItems)
      fail("too few items");
    if (typeof rule.maxItems === "number" && value.length > rule.maxItems)
      fail("too many items");
    if (object(rule.items))
      value.forEach((v, i) => match(rule.items as Rule, v, `${path}[${i}]`));
  }
  if (object(value)) {
    if (Array.isArray(rule.required))
      for (const key of rule.required)
        if (typeof key === "string" && !(key in value)) fail(`missing ${key}`);
    const properties = object(rule.properties) ? rule.properties : {};
    for (const [key, v] of Object.entries(value)) {
      if (object(properties[key])) match(properties[key], v, `${path}.${key}`);
      else if (rule.additionalProperties === false) fail(`unexpected ${key}`);
    }
  }
  if (Array.isArray(rule.allOf))
    for (const child of rule.allOf) match(child as Rule, value, path);
  if (
    Array.isArray(rule.anyOf) &&
    !rule.anyOf.some((child) => {
      try {
        match(child as Rule, value, path);
        return true;
      } catch {
        return false;
      }
    })
  )
    fail("invalid section data");
  if (object(rule.if)) {
    let yes = true;
    try {
      match(rule.if, value, path);
    } catch {
      yes = false;
    }
    const branch = yes ? rule.then : rule.else;
    if (object(branch)) match(branch, value, path);
  }
}
export function validatePayload(value: unknown): void {
  match(schema as Rule, value);
}

// The engine deliberately leaves extensible metadata open. Require the fields
// consumed by this UI as well, so an incompatible export fails before rendering.
export function validateViewData(section: Section, value: unknown): void {
  if (
    object(value) &&
    value.status === "unavailable" &&
    !("forecasts" in value)
  )
    return;
  const number = { type: "number" },
    nullable = { type: ["number", "null"] },
    string = { type: "string" };
  const array = (items: Rule): Rule => ({ type: "array", items });
  const record = (properties: Record<string, Rule>): Rule => ({
    type: "object",
    required: Object.keys(properties),
    properties,
  });
  const years = record({ n_years: number, years_used: array(number) });
  const metric = record({
    n: number,
    origins: number,
    mae: nullable,
    rmse: nullable,
    mean_bias: nullable,
    interval_n: number,
    coverage95: nullable,
  });
  const metricSet = {
    type: "object",
    properties: {
      seasonal_median: metric,
      seasonal_naive: metric,
      sarima: metric,
    },
  };
  const views: Record<Section, Rule> = {
    history: record({
      monthly: array(record({ year: number, month: number })),
      summary: record({
        highest_year: nullable,
        highest_month: { type: ["string", "null"] },
        trend: record({ slope_per_year: nullable, n_years: number }),
      }),
    }),
    climatology: record({
      reference: record({
        start_year: number,
        end_year: number,
        min_years: number,
      }),
      months: array(
        record({
          month: number,
          n_years: number,
          years_used: array(number),
          median: nullable,
          p25: nullable,
          p75: nullable,
        }),
      ),
    }),
    anomalies: record({
      months: array(
        record({
          date: string,
          source: string,
          absolute: nullable,
          percent: nullable,
          z_score: nullable,
          robust_z: nullable,
          percentile: nullable,
          null_reasons: { type: "object" },
          reference: years,
        }),
      ),
    }),
    forecast: record({
      training_period: record({
        start: { type: ["string", "null"] },
        end: { type: ["string", "null"] },
        valid_months: number,
      }),
      predictions: array(
        record({
          date: string,
          value: nullable,
          lower: nullable,
          upper: nullable,
        }),
      ),
      limitations: array(string),
      backtesting: {
        type: "object",
        properties: {
          validation: record({ paired_cases: number, metrics: metricSet }),
        },
      },
    }),
    fire_weather: record({
      status: string,
      forecasts: array({ type: "object" }),
    }),
  };
  match(views[section], value);
  if (
    section === "forecast" &&
    object(value) &&
    object(value.backtesting) &&
    object(value.backtesting.paired_by_horizon)
  ) {
    for (const group of Object.values(value.backtesting.paired_by_horizon))
      match(record({ paired_cases: number, metrics: metricSet }), group);
  }
}

export function assertFiniteTree(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Nonfinite analytics number");
  if (value && typeof value === "object")
    Object.values(value).forEach(assertFiniteTree);
}
