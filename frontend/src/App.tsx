import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { api, type Heatmap, type Plan, type PlanRequest } from "./api";
import { HeatControls } from "./components/HeatControls";
import { RouteCards } from "./components/RouteCards";
import { TripForm } from "./components/TripForm";
import { cumulativeMiles, decodePolyline, type LngLat, mileAtTime, pointAtMile } from "./geo";
import { type HeatVariable, LEVEL_COLORS, LEVELS } from "./risk";

// The map library is most of the download; load it as its own file so the form shows at once.
const MapView = lazy(() => import("./components/MapView"));

export default function App() {
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

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Weather-Aware Truck Routing</h1>
          <p>Three truck routes, weather at the hour the truck gets there, and the safest pick.</p>
        </header>
        <TripForm busy={busy} onSubmit={submit} />
        {error && <div className="error">{error}</div>}
        {plan ? (
          <RouteCards plan={plan} selected={selected} onSelect={setSelected} onCheckpoint={(lng, lat) => setFocus([lng, lat])} />
        ) : (
          <div className="empty">
            Enter a trip and press <b>Find the safest route</b>. Weather comes from Open-Meteo, routes from Valhalla
            (truck profile), places from Photon (OpenStreetMap).
          </div>
        )}
        <footer className="legend">
          {LEVELS.map((l, i) => (
            <span key={l}>
              <i style={{ background: LEVEL_COLORS[i] }} />
              {l}
            </span>
          ))}
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
        />
        </Suspense>
        <HeatControls
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
          loading={heatLoading}
        />
        {busy && <div className="map-busy">Finding routes and reading the forecast…</div>}
      </main>
    </div>
  );
}
