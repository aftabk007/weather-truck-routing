import { type CSSProperties, useEffect, useMemo } from "react";
import { HEAT, type HeatVariable } from "../risk";

const TABS: { key: HeatVariable; label: string }[] = [
  { key: "risk", label: "Risk" },
  { key: "wind", label: "Wind" },
  { key: "rain", label: "Rain" },
  { key: "snow", label: "Snow" },
];

type Props = {
  start: string | null; // ISO, hour 0 of the forecast
  hours: number;
  hour: number;
  setHour: (h: number | ((h: number) => number)) => void;
  heatVar: HeatVariable;
  setHeatVar: (v: HeatVariable) => void;
  show: boolean;
  setShow: (s: boolean) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  truckNote: string | null;
  departure: string | null;
  arrival: string | null;
  loading: boolean;
};

const dayTime = (t: number) =>
  new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Forecast timeline along the bottom of the map: 0–48 h, play, layer tabs, legend. */
export function TimelineDock(p: Props) {
  const max = Math.max(p.hours - 1, 1);
  const t0 = p.start ? Date.parse(p.start) : null;

  // The trip inside the 48-hour forecast, in slider hours (null when out of range).
  const hourOf = (iso: string | null) => (iso && t0 ? (Date.parse(iso) - t0) / 3600_000 : null);
  const depH = hourOf(p.departure);
  const arrH = hourOf(p.arrival);
  const playFrom = depH != null ? Math.min(Math.max(Math.floor(depH), 0), max) : 0;
  const playTo = arrH != null ? Math.min(Math.max(Math.ceil(arrH), playFrom), max) : max;

  // Play runs from departure to arrival and stops there (the map's frame loop is
  // the clock; see MapView). The rest of the 48 hours stays available by dragging.

  const togglePlay = () => {
    if (p.playing) return p.setPlaying(false);
    if (p.hour < playFrom || p.hour >= playTo) p.setHour(playFrom); // replay the trip from departure
    p.setPlaying(true);
  };

  // Keyboard: ←/→ step an hour, space plays (when focus is not in a text field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!t0 || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") p.setHour((h) => Math.min(h + 1, max));
      else if (e.key === "ArrowLeft") p.setHour((h) => Math.max(h - 1, 0));
      else if (e.key === " ") togglePlay();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t0, max, p.playing, p.hour, playFrom, playTo, p.setHour, p.setPlaying]); // togglePlay reads these

  // A tick every 6 hours, labelled with the day at midnight.
  const ticks = useMemo(() => {
    if (!t0) return [];
    const out: { h: number; label: string; day: boolean }[] = [];
    for (let h = 0; h <= max; h++) {
      const d = new Date(t0 + h * 3600_000);
      if (d.getHours() % 6 !== 0) continue;
      const day = d.getHours() === 0;
      out.push({
        h,
        day,
        label: day ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) : d.toLocaleTimeString(undefined, { hour: "numeric" }),
      });
    }
    return out;
  }, [t0, max]);

  const pos = (iso: string | null) => {
    if (!iso || !t0) return null;
    const h = (Date.parse(iso) - t0) / 3600_000;
    return h >= 0 && h <= max ? (h / max) * 100 : null;
  };
  const dep = pos(p.departure);
  const arr = pos(p.arrival);
  const legend = HEAT[p.heatVar];
  const gradient = `linear-gradient(90deg, ${legend.stops.map(([, c], i) => `${c} ${(i / (legend.stops.length - 1)) * 100}%`).join(", ")})`;

  return (
    <section className="dock" aria-label="Forecast timeline">
      <div className="dock-top">
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          disabled={!t0}
          aria-label={p.playing ? "Pause" : "Play"}
          title="Play the trip, departure to arrival (space)"
        >
          {p.playing ? "❚❚" : "▶"}
        </button>
        <div className="dock-time">
          <strong>{p.loading ? "Loading forecast…" : t0 ? dayTime(t0 + p.hour * 3600_000) : "Forecast timeline"}</strong>
          <span>
            {t0
              ? `+${p.hour} h from now${p.departure && p.arrival ? ` · trip ${dayTime(Date.parse(p.departure))} → ${dayTime(Date.parse(p.arrival))}` : ""}`
              : "Plan a trip to load 48 hours of weather"}
          </span>
        </div>
        {p.truckNote && <div className="dock-truck">🚚 {p.truckNote}</div>}
        <div className="dock-tools">
          <div className="tabs" role="tablist" aria-label="Heatmap layer">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={p.heatVar === t.key}
                className={p.heatVar === t.key ? "on" : ""}
                onClick={() => p.setHeatVar(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="toggle" title="Show the weather heatmap">
            <input type="checkbox" checked={p.show} onChange={(e) => p.setShow(e.target.checked)} />
            <span aria-hidden />
            Heatmap
          </label>
        </div>
      </div>

      <div className="track">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={p.hour}
          onChange={(e) => p.setHour(Number(e.target.value))}
          disabled={!t0}
          aria-label="Forecast hour"
          style={{ "--fill": `${(p.hour / max) * 100}%` } as CSSProperties}
        />
        {depH != null && arrH != null && depH < max && arrH > 0 && (
          <span
            className="trip-span"
            style={{ left: `${(Math.max(depH, 0) / max) * 100}%`, width: `${((Math.min(arrH, max) - Math.max(depH, 0)) / max) * 100}%` }}
            title="Your trip"
          />
        )}
        {dep != null && <span className="mark dep" style={{ left: `${dep}%` }} title="Departure" />}
        {arr != null && <span className="mark arr" style={{ left: `${arr}%` }} title="Arrival (selected route)" />}
        <div className="ticks" aria-hidden>
          {ticks.map((t) => (
            <span key={t.h} className={t.day ? "day" : ""} style={{ left: `${(t.h / max) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="dock-legend">
        <span className="legend-name">{legend.label}</span>
        <div className="legend-bar" style={{ background: gradient }} />
        <div className="legend-stops">
          {legend.stops.map(([v]) => (
            <span key={v}>{p.heatVar === "risk" ? ["Low", "Moderate", "High", "Severe", "No Travel"][v] : `${v}${legend.unit ? ` ${legend.unit}` : ""}`}</span>
          ))}
        </div>
        <span className="legend-marks">
          <i className="mark-dot dep" /> departure <i className="mark-dot trip" /> trip <i className="mark-dot arr" /> arrival
        </span>
      </div>
    </section>
  );
}
