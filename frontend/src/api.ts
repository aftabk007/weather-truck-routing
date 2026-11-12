export type Place = { label: string; lat: number; lon: number };

export type TruckType = "dry_van" | "reefer" | "flatbed" | "box_truck" | "tanker";

export type TruckSpec = {
  type: TruckType;
  label: string;
  height_ft: number;
  width_ft: number;
  length_ft: number;
  empty_lb: number;
  axle_count: number;
  hazmat: boolean;
};

export type TruckChoice = { type: TruckType } & Partial<Omit<TruckSpec, "type" | "label">>;

export type LevelName = "Low" | "Moderate" | "High" | "Severe" | "No Travel";

export type Checkpoint = {
  index: number;
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  drive_s: number; // driving time from the start, rest stops excluded
  covers_mi: number;
  level: number | null;
  level_name: LevelName | "No forecast";
  reasons: string[];
  wind_mph?: number;
  gust_mph?: number;
  rain_in_hr?: number;
  snow_in_hr?: number;
  weather_code?: number | null;
};

export type RoutePlan = {
  id: string;
  rank: number;
  via: string[];
  source: "valhalla" | "detour";
  distance_mi: number;
  drive_s: number;
  travel_s: number;
  arrival: string;
  polyline: string;
  checkpoints: Checkpoint[];
  summary: {
    miles_by_level: Record<LevelName, number>;
    avg_risk: number;
    worst_level: number | null;
    unknown_mi: number;
  };
};

export type Plan = {
  departure: string;
  load_lb: number;
  truck: TruckSpec & { gross_lb: number; over_federal_limit: boolean };
  interval_mi: number;
  rest_stops: boolean;
  routes: RoutePlan[];
  recommended: string;
  reason: string;
  corridor: [number, number][];
};

export type HeatCell = {
  lat: number;
  lon: number;
  risk: (number | null)[];
  wind: (number | null)[];
  rain: (number | null)[];
  snow: (number | null)[];
};

export type Heatmap = { start: string; hours: number; spacing_deg: number; cells: HeatCell[] };

export type PlanRequest = {
  origin: Place;
  destination: Place;
  departure: string;
  load_lb: number;
  interval_mi: 10 | 25 | 50;
  rest_stops: boolean;
  truck: TruckChoice;
};

async function call<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/${path}`, { ...init, signal, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body.error ??
      Object.entries(body)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : JSON.stringify(v)}`)
        .join("; ");
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  trucks: () => call<{ default: TruckType; presets: TruckSpec[] }>("trucks"),
  geocode: (q: string, signal?: AbortSignal) =>
    call<{ results: Place[] }>(`geocode?q=${encodeURIComponent(q)}`, undefined, signal).then((r) => r.results),
  plan: (req: PlanRequest) => call<Plan>("plan", { method: "POST", body: JSON.stringify(req) }),
  heatmap: (corridor: [number, number][], load_lb: number) =>
    call<Heatmap>("heatmap", { method: "POST", body: JSON.stringify({ corridor, load_lb }) }),
};
