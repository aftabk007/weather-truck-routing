import { useEffect } from "react";
import { fmtTime, HEAT, type HeatVariable } from "../risk";

type Props = {
  start: string | null;
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
  loading: boolean;
};

export function HeatControls(p: Props) {
  const max = Math.max(p.hours - 1, 0);

  // Play: step one hour every 400 ms, loop at the end.
  useEffect(() => {
    if (!p.playing) return;
    const id = window.setInterval(() => p.setHour((h) => (h >= max ? 0 : h + 1)), 400);
    return () => window.clearInterval(id);
  }, [p.playing, max, p.setHour]);

  const legend = HEAT[p.heatVar];
  const at = p.start ? Date.parse(p.start) + p.hour * 3600_000 : null;

  return (
    <div className="heat-controls">
      <div className="heat-row">
        <label className="check">
          <input type="checkbox" checked={p.show} onChange={(e) => p.setShow(e.target.checked)} />
          Weather heatmap
        </label>
        <select value={p.heatVar} onChange={(e) => p.setHeatVar(e.target.value as HeatVariable)} aria-label="Heatmap layer">
          {(Object.keys(HEAT) as HeatVariable[]).map((k) => (
            <option key={k} value={k}>
              {HEAT[k].label}
            </option>
          ))}
        </select>
        <span className="heat-time">
          {p.loading ? "Loading forecast…" : at ? `+${p.hour} h · ${fmtTime(at)}` : "Plan a trip to load the forecast"}
        </span>
      </div>
      <div className="heat-row">
        <button
          type="button"
          className="play"
          onClick={() => p.setPlaying(!p.playing)}
          disabled={!p.start}
          aria-label={p.playing ? "Pause" : "Play"}
        >
          {p.playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={p.hour}
          onChange={(e) => p.setHour(Number(e.target.value))}
          disabled={!p.start}
          aria-label="Forecast hour"
        />
        <span className="ticks">0–{max} h</span>
      </div>
      <div className="heat-legend">
        {legend.stops.map(([v, c]) => (
          <span key={v}>
            <i style={{ background: c }} />
            {p.heatVar === "risk" ? ["Low", "Mod", "High", "Severe", "No Travel"][v] : `${v}${legend.unit ? ` ${legend.unit}` : ""}`}
          </span>
        ))}
      </div>
      {p.truckNote && <div className="truck-note">🚚 {p.truckNote}</div>}
    </div>
  );
}
