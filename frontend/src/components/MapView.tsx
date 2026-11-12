import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import {
  AttributionControl,
  type GeoJSONSource,
  Map as MapLibreMap,
  type MapLayerMouseEvent,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Heatmap, Plan } from "../api";
import { bounds, type LngLat } from "../geo";
import { fmtTime, HEAT, HEAT_FLOOR, type HeatVariable, levelColor } from "../risk";

// MapLibre 6 finds its worker next to its own file, which a bundler moves.
// Let Vite build the worker and tell MapLibre where it is.
setWorkerUrl(mapWorkerUrl);

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const DOCK_PADDING = { top: 96, bottom: 190, left: 60, right: 70 };
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const HEAT_KEY: Record<HeatVariable, string> = { risk: "r", wind: "w", rain: "p", snow: "s" };

type Props = {
  plan: Plan | null;
  lines: Record<string, LngLat[]>;
  heat: Heatmap | null;
  selected: string;
  onSelect: (id: string) => void;
  hour: number;
  heatVar: HeatVariable;
  showHeat: boolean;
  truck: { at: LngLat; label: string } | null;
  focus: LngLat | null;
  ends: { from: LngLat; to: LngLat } | null;
};

/** Paint for the heatmap circles at slider hour `h`. Only the property name
 * changes per hour, so moving the slider is a cheap GPU restyle, no new data. */
function heatPaint(v: HeatVariable, h: number) {
  const value: ExpressionSpecification = ["coalesce", ["get", `${HEAT_KEY[v]}${h}`], -1];
  const color: ExpressionSpecification = ["interpolate", ["linear"], value, ...HEAT[v].stops.flat()] as ExpressionSpecification;
  const opacity: ExpressionSpecification = ["case", ["<", value, HEAT_FLOOR[v]], 0, 0.42];
  return { color, opacity };
}

/** Gradient along the selected route: each stretch takes its checkpoint's risk colour. */
function riskGradient(plan: Plan, id: string): ExpressionSpecification | null {
  const r = plan.routes.find((x) => x.id === id);
  if (!r || r.checkpoints.length < 2) return null;
  const total = r.distance_mi || 1;
  const cps = r.checkpoints;
  const expr: unknown[] = ["step", ["line-progress"], levelColor(cps[0].level)];
  let last = 0;
  for (let i = 1; i < cps.length; i++) {
    const p = Math.min(0.9999, (cps[i - 1].mile + cps[i].mile) / 2 / total);
    if (p <= last) continue;
    expr.push(p, levelColor(cps[i].level));
    last = p;
  }
  return expr as ExpressionSpecification;
}

export default function MapView({ plan, lines, heat, selected, onSelect, hour, heatVar, showHeat, truck, focus, ends }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const truckRef = useRef<Marker | null>(null);
  const tagRefs = useRef<Marker[]>([]);
  const endRefs = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once, with empty sources and layers in drawing order.
  useEffect(() => {
    const map = new MapLibreMap({ container: box.current!, style: STYLE, center: [-96, 38], zoom: 3.6, attributionControl: false });
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("heat", { type: "geojson", data: EMPTY });
      map.addSource("routes", { type: "geojson", data: EMPTY });
      map.addSource("selected", { type: "geojson", data: EMPTY, lineMetrics: true });
      map.addSource("checkpoints", { type: "geojson", data: EMPTY });

      map.addLayer({ id: "heat", type: "circle", source: "heat", paint: { "circle-blur": 1, "circle-radius": 10 } });
      map.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#8ea0bd", "line-width": 3.5, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "selected-glow",
        type: "line",
        source: "selected",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#4dabf7", "line-width": 18, "line-blur": 10, "line-opacity": 0.28 },
      });
      map.addLayer({
        id: "selected-casing",
        type: "line",
        source: "selected",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#020617", "line-width": 9 },
      });
      map.addLayer({
        id: "selected",
        type: "line",
        source: "selected",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 5, "line-color": "#228be6" },
      });
      map.addLayer({
        id: "checkpoints",
        type: "circle",
        source: "checkpoints",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["get", "sel"], 6, 3.5],
          "circle-stroke-color": "#0b1220",
          "circle-stroke-width": ["case", ["get", "sel"], 2, 1],
          "circle-opacity": ["case", ["get", "sel"], 1, 0.7],
        },
      });

      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on("mouseenter", "checkpoints", (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string | number>;
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as LngLat)
          .setHTML(
            `<div class="pop-head"><b>Route ${p.route}</b> · mile ${Number(p.mile).toFixed(0)}` +
              `<span class="pop-level" style="--c:${p.color}">${p.level}</span></div>` +
              `<div class="pop-eta">ETA ${fmtTime(String(p.eta))}</div>` +
              `<dl><dt>Wind</dt><dd>${p.wind} mph <small>gusts ${p.gust}</small></dd>` +
              `<dt>Rain</dt><dd>${p.rain} in/hr</dd><dt>Snow</dt><dd>${p.snow} in/hr</dd></dl>` +
              (p.reasons ? `<div class="pop-reason">${p.reasons}</div>` : ""),
          )
          .addTo(map);
      });
      map.on("mouseleave", "checkpoints", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "routes", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(String(id));
      });
      map.on("mouseenter", "routes", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "routes", () => (map.getCanvas().style.cursor = ""));
      setReady(true);
    });
    return () => map.remove();
  }, []);

  // New plan: routes, checkpoints, zoom to fit.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const routes: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (plan?.routes ?? []).map((r) => ({
        type: "Feature",
        properties: { id: r.id },
        geometry: { type: "LineString", coordinates: lines[r.id] ?? [] },
      })),
    };
    (map.getSource("routes") as GeoJSONSource).setData(routes);
    if (plan) {
      const all = Object.values(lines).flat();
      if (all.length) map.fitBounds(bounds(all), { padding: DOCK_PADDING, duration: 900 });
    }
  }, [ready, plan, lines]);

  // Selected route: highlighted line with risk colours, bigger checkpoints.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const line = plan ? lines[selected] : undefined;
    (map.getSource("selected") as GeoJSONSource).setData(
      line ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } : EMPTY,
    );
    const grad = plan ? riskGradient(plan, selected) : null;
    map.setPaintProperty("selected", "line-gradient", grad ?? undefined);
    map.setFilter("routes", ["!=", ["get", "id"], selected]);

    const features: GeoJSON.Feature[] = [];
    for (const r of plan?.routes ?? []) {
      for (const c of r.checkpoints) {
        features.push({
          type: "Feature",
          properties: {
            route: r.id,
            sel: r.id === selected,
            mile: c.mile,
            eta: c.eta,
            wind: c.wind_mph?.toFixed(0) ?? "–",
            gust: c.gust_mph?.toFixed(0) ?? "–",
            rain: c.rain_in_hr?.toFixed(2) ?? "–",
            snow: c.snow_in_hr?.toFixed(1) ?? "–",
            level: c.level_name,
            color: levelColor(c.level),
            reasons: c.reasons.join("<br/>"),
          },
          geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        });
      }
    }
    // Selected route's checkpoints last, so they draw on top.
    features.sort((a, b) => Number(a.properties!.sel) - Number(b.properties!.sel));
    (map.getSource("checkpoints") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [ready, plan, lines, selected]);

  // A/B/C tags along each route (selected one highlighted), clickable.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    tagRefs.current.forEach((m) => m.remove());
    tagRefs.current = (plan?.routes ?? []).flatMap((r, i) => {
      const line = lines[r.id];
      if (!line?.length) return [];
      const at = line[Math.floor(line.length * (0.35 + 0.12 * i))];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `route-tag${r.id === selected ? " on" : ""}${r.id === plan?.recommended ? " best" : ""}`;
      el.textContent = r.id;
      el.title = `Route ${r.id}`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectRef.current(r.id);
      });
      return [new Marker({ element: el }).setLngLat(at).addTo(map)];
    });
  }, [ready, plan, lines, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    endRefs.current.forEach((m) => m.remove());
    endRefs.current = [];
    if (!ends) return;
    for (const [cls, at, title] of [["pin start", ends.from, "Origin"], ["pin end", ends.to, "Destination"]] as const) {
      const el = document.createElement("div");
      el.className = cls;
      el.title = title;
      endRefs.current.push(new Marker({ element: el }).setLngLat(at).addTo(map));
    }
  }, [ready, ends]);

  // Heatmap data: one feature per grid cell, all 49 hours of all variables as properties.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: GeoJSON.Feature[] = (heat?.cells ?? []).map((c) => {
      const props: Record<string, number | null> = {};
      for (let h = 0; h < c.risk.length; h++) {
        props[`r${h}`] = c.risk[h];
        props[`w${h}`] = c.wind[h];
        props[`p${h}`] = c.rain[h];
        props[`s${h}`] = c.snow[h];
      }
      return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: [c.lon, c.lat] } };
    });
    (map.getSource("heat") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    if (heat && heat.cells.length) {
      // Circle radius that just covers one grid cell at every zoom (Web Mercator).
      const midLat = heat.cells.reduce((s, c) => s + c.lat, 0) / heat.cells.length;
      const pxPerDegAtZ0 = 512 / 360;
      const r0 = (heat.spacing_deg * pxPerDegAtZ0 * 0.95) / Math.cos((midLat * Math.PI) / 180);
      map.setPaintProperty("heat", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, r0, 20, r0 * 2 ** 20]);
    }
  }, [ready, heat]);

  // Slider / variable / visibility: restyle only.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const { color, opacity } = heatPaint(heatVar, hour);
    map.setPaintProperty("heat", "circle-color", color);
    map.setPaintProperty("heat", "circle-opacity", opacity);
    map.setLayoutProperty("heat", "visibility", showHeat ? "visible" : "none");
  }, [ready, hour, heatVar, showHeat]);

  // Truck position at the slider time.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!truck) {
      truckRef.current?.remove();
      truckRef.current = null;
      return;
    }
    if (!truckRef.current) {
      const el = document.createElement("div");
      el.className = "truck";
      el.textContent = "🚚";
      truckRef.current = new Marker({ element: el }).setLngLat(truck.at).addTo(map);
    }
    truckRef.current.setLngLat(truck.at);
    truckRef.current.getElement().title = truck.label;
  }, [ready, truck]);

  useEffect(() => {
    if (ready && focus) mapRef.current?.flyTo({ center: focus, zoom: Math.max(mapRef.current.getZoom(), 8), duration: 600 });
  }, [ready, focus]);

  return <div ref={box} className="map" aria-label="Route map" />;
}

