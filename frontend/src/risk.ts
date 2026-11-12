import type { LevelName } from "./api";

export const LEVELS: LevelName[] = ["Low", "Moderate", "High", "Severe", "No Travel"];

/** One colour per risk level; checked for contrast on the light basemap. */
export const LEVEL_COLORS = ["#2f9e44", "#f2b705", "#f76707", "#e03131", "#7b2cbf"];
export const NO_DATA_COLOR = "#adb5bd";

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
      [0, "#2f9e44"],
      [25, "#f2b705"],
      [35, "#f76707"],
      [45, "#e03131"],
      [55, "#7b2cbf"],
    ],
  },
  rain: {
    label: "Rain",
    unit: "in/hr",
    stops: [
      [0, "#a5d8ff"],
      [0.1, "#4dabf7"],
      [0.25, "#1c7ed6"],
      [0.5, "#5f3dc4"],
      [1, "#862e9c"],
    ],
  },
  snow: {
    label: "Snow",
    unit: "in/hr",
    stops: [
      [0, "#e7f5ff"],
      [0.5, "#a5d8ff"],
      [1, "#74c0fc"],
      [2, "#4263eb"],
      [3, "#364fc7"],
    ],
  },
};

/** Below this value a heatmap cell is left transparent, so calm areas stay clear. */
export const HEAT_FLOOR: Record<HeatVariable, number> = { risk: 0.5, wind: 15, rain: 0.02, snow: 0.05 };

export const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m === 60 ? `${h + 1} h` : `${h} h ${String(m).padStart(2, "0")} m`;
};

export const fmtTime = (iso: string | number) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
