import { type CSSProperties, lazy, Suspense, useCallback, useMemo, useState } from "react";
import { api, type Heatmap, type Plan, type PlanRequest } from "./api";
import { Examples } from "./components/Examples";
import { RouteCards } from "./components/RouteCards";
import { TimelineDock } from "./components/TimelineDock";
import { DEFAULT_TRIP, TripForm, type TripValues } from "./components/TripForm";
import { cumulativeMiles, decodePolyline, type LngLat, mileAtTime, pointAtMile } from "./geo";
import { fmtHours, type HeatVariable, LEVELS, levelColor } from "./risk";

// The map library is most of the download; load it as its own file so the form shows at once.
const MapView = lazy(() => import("./components/MapView"));

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#13233d" />
      <path d="M6 23c5 0 5-9 10-9s5 7 10 7" fill="none" stroke="#4dabf7" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="6" cy="23" r="2.4" fill="#40c057" />
      <circle cx="26" cy="21" r="2.4" fill="#fa5252" />
      <path d="M17 6.5a3.4 3.4 0 0 1 6.5 1.2h.4a2.3 2.3 0 0 1 0 4.6H15.6a2.6 2.6 0 0 1-.3-5.2 3.4 3.4 0 0 1 1.7-.6Z" fill="#c5d4ea" />
    </svg>
  );
}

export default function App() {
  const [seed, setSeed] = useState<{ key: number; values: TripValues; auto: boolean }>({ key: 0, values: DEFAULT_TRIP, auto: false });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [heat, setHeat] = useState<Heatmap | null>(null);
  const [busy, setBusy] = useState(false);
  const [heatLoading, setHeatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("A");
  const [hour, setHour] = useState(0);
  const [heatVar, setHeatVar] = useState<HeatVariable>("risk");
  const [showHeat, setShowHeat] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState<LngLat | null>(null);

  const submit = useCallback(async (req: PlanRequest) => {
    setBusy(true);
    setError(null);
    setPlaying(false);
    try {
      const p = await api.plan(req);
      setPlan(p);
      setSelected(p.recommended);
      setHeat(null);
      setHeatLoading(true);
      // Routes show first; the corridor forecast follows in a second request.
      api
        .heatmap(p.corridor, p.load_lb)
        .then((h) => {
          setHeat(h);
          // Start the slider at departure time, if it is within the 48 hours.
          const offset = Math.round((Date.parse(p.departure) - Date.parse(h.start)) / 3600_000);
          setHour(Math.min(Math.max(offset, 0), h.hours - 1));
        })
        .catch((e: Error) => setError(`Heatmap: ${e.message}`))
        .finally(() => setHeatLoading(false));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Decode each route once; reused by the map and the truck marker.
  const lines = useMemo(() => {
    const out: Record<string, LngLat[]> = {};
    for (const r of plan?.routes ?? []) out[r.id] = decodePolyline(r.polyline);
    return out;
  }, [plan]);
  const cum = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [id, line] of Object.entries(lines)) out[id] = cumulativeMiles(line);
    return out;
  }, [lines]);
  const ends = useMemo(() => {
    const line = plan ? lines[plan.recommended] : undefined;
    return line?.length ? { from: line[0], to: line[line.length - 1] } : null;
  }, [plan, lines]);

  // Where the truck is on the selected route at the slider time.
  const truck = useMemo(() => {
    const route = plan?.routes.find((r) => r.id === selected);
    if (!route || !heat || !lines[selected]) return null;
    const t = Date.parse(heat.start) + hour * 3600_000;
    const { mile, state } = mileAtTime(route.checkpoints, t);
    const scale = cum[selected].at(-1)! / (route.distance_mi || 1); // map line vs router miles
    const at = pointAtMile(lines[selected], cum[selected], mile * scale);
    const label =
      state === "before"
        ? `Route ${selected}: not departed yet`
        : state === "arrived"
          ? `Route ${selected}: arrived`
          : `Route ${selected}: mile ${mile.toFixed(0)} of ${route.distance_mi.toFixed(0)}`;
    return { at, label };
  }, [plan, heat, hour, selected, lines, cum]);

  const sel = plan?.routes.find((r) => r.id === selected) ?? null;

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <Logo />
          <div>
            <h1>Weather-Aware Truck Routing</h1>
            <p>Three truck routes · weather at each ETA · the safest pick</p>
          </div>
        </header>

        <TripForm key={seed.key} initial={seed.values} autoSubmit={seed.auto} busy={busy} onSubmit={submit} />

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {busy && !plan && (
          <div className="skeleton" aria-hidden>
            <i />
            <i />
            <i />
          </div>
        )}
        {plan ? (
          <RouteCards plan={plan} selected={selected} onSelect={setSelected} onCheckpoint={(lng, lat) => setFocus([lng, lat])} />
        ) : (
          !busy && <Examples onPick={(values) => setSeed((s) => ({ key: s.key + 1, values, auto: true }))} />
        )}

        <footer className="sources">
          Routing © Valhalla / OpenStreetMap · Weather © Open-Meteo · Places © Photon · Map © OpenFreeMap
        </footer>
      </aside>

      <main className="map-wrap">
        <Suspense fallback={<div className="map map-loading">Loading map…</div>}>
          <MapView
            plan={plan}
            lines={lines}
            heat={heat}
            selected={selected}
            onSelect={setSelected}
            hour={hour}
            heatVar={heatVar}
            showHeat={showHeat}
            truck={truck}
            focus={focus}
            ends={ends}
          />
        </Suspense>

        {plan && sel && (
          <div className="map-chip" aria-live="polite">
            <span className={`letter ${sel.id === plan.recommended ? "best" : ""}`}>{sel.id}</span>
            <div>
              <b>{sel.id === plan.recommended ? "Recommended" : `Route ${sel.id}`}</b>
              <span>
                {fmtHours(sel.travel_s)} · {sel.distance_mi.toFixed(0)} mi
              </span>
            </div>
            <span className="pill" style={{ "--c": levelColor(sel.summary.worst_level) } as CSSProperties}>
              {sel.summary.worst_level == null ? "No forecast" : LEVELS[sel.summary.worst_level]}
            </span>
          </div>
        )}

        <TimelineDock
          start={heat?.start ?? null}
          hours={heat?.hours ?? 49}
          hour={hour}
          setHour={setHour}
          heatVar={heatVar}
          setHeatVar={setHeatVar}
          show={showHeat}
          setShow={setShowHeat}
          playing={playing}
          setPlaying={setPlaying}
          truckNote={truck?.label ?? null}
          departure={plan?.departure ?? null}
          arrival={sel?.arrival ?? null}
          loading={heatLoading}
        />

        {busy && (
          <div className="map-busy">
            <i className="spinner" aria-hidden /> Finding truck routes and reading the forecast…
          </div>
        )}
      </main>
    </div>
  );
}
