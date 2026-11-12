import type { Plan, RoutePlan } from "../api";
import { fmtHours, fmtTime, LEVEL_COLORS, LEVELS, levelColor } from "../risk";

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
      {unknown_mi > 0 && (
        <span className="unknown" style={{ width: `${(unknown_mi / total) * 100}%` }} title={`No forecast: ${unknown_mi} mi`} />
      )}
    </div>
  );
}

export function RouteCards({ plan, selected, onSelect, onCheckpoint }: Props) {
  const routes = [...plan.routes].sort((a, b) => a.rank - b.rank);
  const sel = plan.routes.find((r) => r.id === selected);

  return (
    <section className="results">
      <p className="reason">
        <strong>Recommended: Route {plan.recommended}.</strong> {plan.reason}
      </p>
      {routes.map((r) => {
        const m = r.summary.miles_by_level;
        const worst = r.summary.worst_level;
        return (
          <button
            key={r.id}
            className={`route-card ${r.id === selected ? "selected" : ""}`}
            onClick={() => onSelect(r.id)}
            aria-pressed={r.id === selected}
          >
            <div className="card-head">
              <span className="route-id">Route {r.id}</span>
              {r.id === plan.recommended ? <span className="badge best">Recommended</span> : <span className="badge">#{r.rank}</span>}
              <span className="worst" style={{ background: levelColor(worst) }}>
                {worst == null ? "No forecast" : LEVELS[worst]}
              </span>
            </div>
            <div className="via">via {r.via.join(", ") || "local roads"}</div>
            <div className="stats">
              <span>
                <b>{r.distance_mi.toFixed(0)}</b> mi
              </span>
              <span title={`Driving ${fmtHours(r.drive_s)}`}>
                <b>{fmtHours(r.travel_s)}</b>
              </span>
              <span>arrive {fmtTime(r.arrival)}</span>
            </div>
            <RiskBar route={r} />
            <div className="miles">
              <span>No Travel {m["No Travel"]} mi</span>
              <span>Severe {m.Severe} mi</span>
              <span>High {m.High} mi</span>
              <span>avg risk {r.summary.avg_risk.toFixed(2)}</span>
            </div>
          </button>
        );
      })}

      {sel && (
        <details className="checkpoints" open>
          <summary>
            Route {sel.id} checkpoints ({sel.checkpoints.length}, every {plan.interval_mi} mi)
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
                <tr key={c.index} onClick={() => onCheckpoint(c.lon, c.lat)} title={c.reasons.join("; ")}>
                  <td>{c.mile.toFixed(0)}</td>
                  <td>{fmtTime(c.eta)}</td>
                  <td>{c.wind_mph != null ? `${c.wind_mph.toFixed(0)} mph` : "–"}</td>
                  <td>{c.rain_in_hr != null ? c.rain_in_hr.toFixed(2) : "–"}</td>
                  <td>{c.snow_in_hr != null ? c.snow_in_hr.toFixed(1) : "–"}</td>
                  <td>
                    <span className="dot" style={{ background: levelColor(c.level) }} /> {c.level_name}
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
