import type { LevelName } from "./api";

export const LEVELS: LevelName[] = ["Low", "Moderate", "High", "Severe", "No Travel"];

/** One colour per risk level, tuned to stand out on the dark map and panels. */
export const LEVEL_COLORS = ["#22c55e", "#facc15", "#fb923c", "#ef4444", "#a855f7"];
export const NO_DATA_COLOR = "#94a3b8";

export const levelColor = (level: number | null) => (level == null ? NO_DATA_COLOR : LEVEL_COLORS[level]);

export type HeatVariable = "risk" | "wind" | "rain" | "snow";

/** Colour ramps for the heatmap. Stops follow the brief's thresholds, so the
 * colours mean the same thing as the checkpoint risk colours. */
export const HEAT: Record<HeatVariable, { label: string; unit: string; stops: [number, string][] }> = {
  risk: {
    label: "Risk (with your load)",
    unit: "",
    stops: LEVEL_COLORS.map((c, i) => [i, c]),
  },
  wind: {
    label: "Wind",
    unit: "mph",
    stops: [
      [0, "#22c55e"],
      [25, "#facc15"],
      [35, "#fb923c"],
      [45, "#ef4444"],
      [55, "#a855f7"],
    ],
  },
  rain: {
    label: "Rain",
    unit: "in/hr",
    stops: [
      [0, "#74c0fc"],
      [0.1, "#339af0"],
      [0.25, "#5c7cfa"],
      [0.5, "#845ef7"],
      [1, "#e64980"],
    ],
  },
  snow: {
    label: "Snow",
    unit: "in/hr",
    stops: [
      [0, "#e7f5ff"],
      [0.5, "#c5f6fa"],
      [1, "#99e9f2"],
      [2, "#66d9e8"],
      [3, "#ffffff"],
    ],
  },
};

/** Below this value a heatmap cell is left transparent, so calm areas stay clear. */
export const HEAT_FLOOR: Record<HeatVariable, number> = { risk: 0.5, wind: 15, rain: 0.02, snow: 0.05 };

export const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (m === 60) return `${h + 1} h`;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")} m`;
};

export const fmtTime = (iso: string | number) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
