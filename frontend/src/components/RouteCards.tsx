import type { CSSProperties } from "react";
import type { Plan, RoutePlan } from "../api";
import { fmtHours, fmtTime, LEVEL_COLORS, LEVELS, levelColor } from "../risk";
import { feetInches } from "./TruckPicker";

type Props = {
  plan: Plan;
  selected: string;
  onSelect: (id: string) => void;
  onCheckpoint: (lng: number, lat: number) => void;
};

function RiskBar({ route }: { route: RoutePlan }) {
  const total = route.distance_mi || 1;
  const { miles_by_level, unknown_mi } = route.summary;
  return (
    <div className="risk-bar" aria-label="Miles by risk level">
      {LEVELS.map((name, i) =>
        miles_by_level[name] > 0 ? (
          <span
            key={name}
            style={{ width: `${(miles_by_level[name] / total) * 100}%`, background: LEVEL_COLORS[i] }}
            title={`${name}: ${miles_by_level[name]} mi`}
          />
        ) : null,
      )}
      {unknown_mi > 0 && <span className="unknown" style={{ width: `${(unknown_mi / total) * 100}%` }} title={`No forecast: ${unknown_mi} mi`} />}
    </div>
  );
}

function LevelPill({ level }: { level: number | null }) {
  return (
    <span className="pill" style={{ "--c": levelColor(level) } as CSSProperties}>
      {level == null ? "No forecast" : LEVELS[level]}
    </span>
  );
}

const riskMiles = (r: RoutePlan) => {
  const m = r.summary.miles_by_level;
  return [
    ["No Travel", m["No Travel"]],
    ["Severe", m.Severe],
    ["High", m.High],
  ] as const;
};

export function RouteCards({ plan, selected, onSelect, onCheckpoint }: Props) {
  const routes = [...plan.routes].sort((a, b) => a.rank - b.rank);
  const best = plan.routes.find((r) => r.id === plan.recommended)!;
  const sel = plan.routes.find((r) => r.id === selected);
  const t = plan.truck;

  return (
    <section className="results">
      <div className="hero">
        <div className="hero-head">
          <span className="letter big">{best.id}</span>
          <div>
            <div className="eyebrow">Recommended</div>
            <div className="hero-via">via {best.via.join(" · ") || "local roads"}</div>
          </div>
          <LevelPill level={best.summary.worst_level} />
        </div>
        <div className="hero-stats">
          <div>
            <b>{fmtHours(best.travel_s)}</b>
            <span>travel time</span>
          </div>
          <div>
            <b>{best.distance_mi.toFixed(0)} mi</b>
            <span>distance</span>
          </div>
          <div>
            <b>{fmtTime(best.arrival)}</b>
            <span>arrival</span>
          </div>
        </div>
        <p className="why">
          <span>why:</span> {plan.reason}
        </p>
        <p className="truck-line">
          Routed for a {t.label.toLowerCase()} · {feetInches(t.height_ft)} × {feetInches(t.width_ft)} × {t.length_ft} ft ·{" "}
          {t.gross_lb.toLocaleString()} lb gross{t.hazmat ? " · hazmat" : ""}. Lower bridges and tighter limits in OpenStreetMap are
          avoided.
        </p>
      </div>

      <div className="section-title">All routes</div>
      {routes.map((r) => (
        <button
          key={r.id}
          className={`route-card ${r.id === selected ? "selected" : ""}`}
          onClick={() => onSelect(r.id)}
          aria-pressed={r.id === selected}
        >
          <div className="card-head">
            <span className={`letter ${r.id === plan.recommended ? "best" : ""}`}>{r.id}</span>
            <div className="card-title">
              <b>{fmtHours(r.travel_s)}</b> · {r.distance_mi.toFixed(0)} mi
              <div className="via">via {r.via.join(" · ") || "local roads"}</div>
            </div>
            <span className="rank">{r.id === plan.recommended ? "Best" : `#${r.rank}`}</span>
          </div>
          <RiskBar route={r} />
          <div className="miles">
            {riskMiles(r).map(([name, mi]) => (
              <span key={name} className={mi > 0 ? "hot" : ""}>
                {name} <b>{mi}</b> mi
              </span>
            ))}
            <span>
              avg <b>{r.summary.avg_risk.toFixed(2)}</b>
            </span>
          </div>
        </button>
      ))}

      {sel && (
        <details className="checkpoints">
          <summary>
            Route {sel.id} checkpoints <span>{sel.checkpoints.length} · every {plan.interval_mi} mi</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th>Mile</th>
                <th>ETA</th>
                <th>Wind</th>
                <th>Rain</th>
                <th>Snow</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {sel.checkpoints.map((c) => (
                <tr key={c.index} onClick={() => onCheckpoint(c.lon, c.lat)} title={c.reasons.join("; ") || "Click to show on the map"}>
                  <td>{c.mile.toFixed(0)}</td>
                  <td>{fmtTime(c.eta)}</td>
                  <td>{c.wind_mph != null ? `${c.wind_mph.toFixed(0)}` : "–"}</td>
                  <td>{c.rain_in_hr != null ? c.rain_in_hr.toFixed(2) : "–"}</td>
                  <td>{c.snow_in_hr != null ? c.snow_in_hr.toFixed(1) : "–"}</td>
                  <td>
                    <LevelPill level={c.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
