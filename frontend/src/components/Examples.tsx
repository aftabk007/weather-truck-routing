import { DEFAULT_TRIP, hoursFromNow, type TripValues } from "./TripForm";

type Example = { title: string; note: string; values: () => TripValues };

/** One-click trips for reviewers. Weather is live, so results change with the forecast. */
const EXAMPLES: Example[] = [
  {
    title: "Dallas → Memphis",
    note: "Regional run, dry van, 42,000 lb",
    values: () => ({ ...DEFAULT_TRIP, departure: hoursFromNow(1) }),
  },
  {
    title: "Philadelphia → Boston",
    note: "I-95 corridor, checks every 10 mi",
    values: () => ({
      ...DEFAULT_TRIP,
      origin: { label: "Philadelphia, Pennsylvania, US", lat: 39.9526, lon: -75.1652 },
      destination: { label: "Boston, Massachusetts, US", lat: 42.3601, lon: -71.0589 },
      departure: hoursFromNow(2),
      intervalMi: 10,
    }),
  },
  {
    title: "Chicago → Denver",
    note: "Long haul, reefer, rest stops on",
    values: () => ({
      ...DEFAULT_TRIP,
      origin: { label: "Chicago, Illinois, US", lat: 41.8781, lon: -87.6298 },
      destination: { label: "Denver, Colorado, US", lat: 39.7392, lon: -104.9903 },
      departure: hoursFromNow(1),
      load: 40000,
      intervalMi: 50,
      truck: { type: "reefer" },
    }),
  },
  {
    title: "Low bridge · Durham, NC",
    note: "13'6\" dry van goes around the 12'4\" bridge; try Box",
    values: () => ({
      ...DEFAULT_TRIP,
      origin: { label: "S Gregson St (north of bridge), Durham, NC", lat: 35.99985, lon: -78.9095 },
      destination: { label: "S Gregson St (south of bridge), Durham, NC", lat: 35.9983, lon: -78.9108 },
      departure: hoursFromNow(1),
      load: 8000,
      intervalMi: 10,
    }),
  },
];

export function Examples({ onPick }: { onPick: (v: TripValues) => void }) {
  return (
    <section className="examples">
      <div className="section-title">Try an example</div>
      {EXAMPLES.map((e) => (
        <button key={e.title} type="button" className="example" onClick={() => onPick(e.values())}>
          <div>
            <b>{e.title}</b>
            <span>{e.note}</span>
          </div>
        </button>
      ))}
      <p className="hint">
        Weather is live from Open-Meteo, so risk changes with the forecast. Routes come from Valhalla's truck profile,
        places from Photon (OpenStreetMap).
      </p>
    </section>
  );
}
