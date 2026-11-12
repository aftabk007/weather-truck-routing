import { type CSSProperties, lazy, Suspense, useCallback, useMemo, useState } from "react";
import { api, type Heatmap, type Plan, type PlanRequest } from "./api";
import { Examples } from "./components/Examples";
import { RouteCards } from "./components/RouteCards";
import { TimelineDock } from "./components/TimelineDock";
import type { Drive } from "./components/MapView";
import { DEFAULT_TRIP, TripForm, type TripValues } from "./components/TripForm";
import { cumulativeMiles, decodePolyline, type LngLat, pointAtMile, truckAt } from "./geo";
import { fmtHours, type HeatVariable, LEVELS, levelColor } from "./risk";

// The map library is most of the download; load it as its own file so the form shows at once.
const MapView = lazy(() => import("./components/MapView"));

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#ffffff" />
      <path d="M7 22c4.5 0 4.5-8 9-8s4.5 6 9 6" fill="none" stroke="#0f1b3d" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="7" cy="22" r="2.6" fill="#0f1b3d" />
      <circle cx="25" cy="20" r="2.6" fill="#ff3d8b" />
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
  const [fit, setFit] = useState<{ key: number; mode: "all" | "selected" }>({ key: 0, mode: "all" });

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
    const { mile, state } = truckAt(route.checkpoints, Date.parse(plan!.departure), plan!.rest_stops, t);
    const scale = cum[selected].at(-1)! / (route.distance_mi || 1); // map line vs router miles
    const at = pointAtMile(lines[selected], cum[selected], mile * scale);
    const where = `mile ${mile.toFixed(0)} of ${route.distance_mi.toFixed(0)}`;
    const label = {
      before: `Route ${selected}: not departed yet`,
      driving: `Route ${selected}: driving, ${where}`,
      break: `Route ${selected}: 30-min break at ${where}`,
      rest: `Route ${selected}: 10-h rest at ${where}`,
      arrived: `Route ${selected}: arrived`,
    }[state];
    return { at, label };
  }, [plan, heat, hour, selected, lines, cum]);

  const sel = plan?.routes.find((r) => r.id === selected) ?? null;

  // Slider hour of the departure (clamped to the 48-h forecast).
  const depHour = useMemo(() => {
    if (!plan || !heat) return 0;
    const h = Math.round((Date.parse(plan.departure) - Date.parse(heat.start)) / 3600_000);
    return Math.min(Math.max(h, 0), heat.hours - 1);
  }, [plan, heat]);

  // Picking a route starts it over: stop playback, back to departure (the truck
  // snaps to the start), and zoom to that route.
  const selectRoute = useCallback(
    (id: string) => {
      setSelected(id);
      setPlaying(false);
      setHour(depHour);
      setFit((f) => ({ key: f.key + 1, mode: "selected" }));
    },
    [depHour],
  );

  // Route data for the smooth truck animation on the map.
  const drive = useMemo<Drive | null>(() => {
    const route = plan?.routes.find((r) => r.id === selected);
    const line = lines[selected];
    if (!route || !heat || !line) return null;
    return {
      checkpoints: route.checkpoints,
      line,
      cum: cum[selected],
      scale: cum[selected].at(-1)! / (route.distance_mi || 1),
      start: Date.parse(heat.start),
      departure: Date.parse(plan!.departure),
      rest: plan!.rest_stops,
      end: Math.min(Date.parse(route.arrival), Date.parse(heat.start) + (heat.hours - 1) * 3600_000),
    };
  }, [plan, heat, selected, lines, cum]);

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <div className="brand-row">
            <Logo />
            <span className="brand-name">Weather-Aware Truck Routing</span>
            <a className="gh" href="https://github.com/aftabk007/weather-truck-routing" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <span className="badge-new">
            <i>New</i> Truck sizes · low bridges avoided
          </span>
          <h1>
            Find the <em>safest</em> route.
          </h1>
          <p>Three truck routes, the weather at the hour you reach each stretch, and one clear pick.</p>
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
          <RouteCards plan={plan} selected={selected} onSelect={selectRoute} onCheckpoint={(lng, lat) => setFocus([lng, lat])} />
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
            onSelect={selectRoute}
            hour={hour}
            heatVar={heatVar}
            showHeat={showHeat}
            drive={drive}
            focus={focus}
            ends={ends}
            follow={playing}
            onHour={setHour}
            onEnd={(h) => {
              setPlaying(false);
              setHour(h);
            }}
            fit={fit}
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
            <button
              type="button"
              className="fit-all"
              onClick={() => {
                setPlaying(false);
                setFit((f) => ({ key: f.key + 1, mode: "all" }));
              }}
              title="Zoom out to show all routes"
            >
              ⤢ All routes
            </button>
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
