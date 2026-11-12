import { useEffect, useRef, useState } from "react";
import type { Place, PlanRequest, TruckChoice } from "../api";
import { PlaceInput } from "./PlaceInput";
import { TruckPicker } from "./TruckPicker";

export type TripValues = {
  origin: Place | null;
  destination: Place | null;
  departure: string; // local "YYYY-MM-DDTHH:MM"
  load: number;
  intervalMi: 10 | 25 | 50;
  rest: boolean;
  truck: TruckChoice;
};

/** Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">, `hours` from now, on the hour. */
export function hoursFromNow(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export const DEFAULT_TRIP: TripValues = {
  origin: { label: "Dallas, Texas, US", lat: 32.7767, lon: -96.797 },
  destination: { label: "Memphis, Tennessee, US", lat: 35.1495, lon: -90.049 },
  departure: hoursFromNow(1),
  load: 42000,
  intervalMi: 25,
  rest: true,
  truck: { type: "dry_van" },
};

type Props = {
  busy: boolean;
  initial: TripValues;
  autoSubmit?: boolean;
  onSubmit: (req: PlanRequest) => void;
};

export function TripForm({ busy, initial, autoSubmit, onSubmit }: Props) {
  const [origin, setOrigin] = useState(initial.origin);
  const [destination, setDestination] = useState(initial.destination);
  const [departure, setDeparture] = useState(initial.departure);
  const [load, setLoad] = useState(initial.load);
  const [intervalMi, setIntervalMi] = useState(initial.intervalMi);
  const [rest, setRest] = useState(initial.rest);
  const [truck, setTruck] = useState<TruckChoice>(initial.truck);

  const ready = Boolean(origin && destination && departure && load >= 0);
  const submit = () => {
    if (!origin || !destination) return;
    onSubmit({
      origin,
      destination,
      departure: new Date(departure).toISOString(),
      load_lb: load,
      interval_mi: intervalMi,
      rest_stops: rest,
      truck,
    });
  };

  // Example trips mount the form with their values and submit once.
  const fired = useRef(false);
  useEffect(() => {
    if (autoSubmit && !fired.current) {
      fired.current = true;
      submit();
    }
  });

  return (
    <form
      className="trip-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <section className="sect">
        <h2>
          <span>1</span> Trip
        </h2>
        <div className="places">
          <PlaceInput label="From" value={origin} onChange={setOrigin} placeholder="City or address" />
          <button
            type="button"
            className="swap"
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
            onClick={() => {
              setOrigin(destination);
              setDestination(origin);
            }}
          >
            ⇅
          </button>
          <PlaceInput label="To" value={destination} onChange={setDestination} placeholder="City or address" />
        </div>
        <div className="row">
          <label className="field">
            <span>Departure</span>
            <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} required />
          </label>
          <label className="field">
            <span>Load weight (lb)</span>
            <input type="number" min={0} max={200000} step={500} value={load} onChange={(e) => setLoad(Number(e.target.value))} required />
          </label>
        </div>
      </section>

      <section className="sect">
        <h2>
          <span>2</span> Truck
        </h2>
        <TruckPicker value={truck} onChange={setTruck} loadLb={load} />
      </section>

      <section className="sect">
        <h2>
          <span>3</span> Check weather every
        </h2>
        <div className="row options">
          <div className="segmented" role="radiogroup" aria-label="Weather check interval">
            {([10, 25, 50] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={intervalMi === n}
                className={intervalMi === n ? "on" : ""}
                onClick={() => setIntervalMi(n)}
              >
                {n} mi
              </button>
            ))}
          </div>
          <label className="toggle" title="30-min break after 8 h of driving, 10-h rest after 11 h (FMCSA)">
            <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} />
            <span aria-hidden />
            Driver rest stops
          </label>
        </div>
      </section>

      <button className="primary" type="submit" disabled={!ready || busy}>
        {busy ? (
          <>
            <i className="spinner" aria-hidden /> Planning routes…
          </>
        ) : (
          "Find the safest route"
        )}
      </button>
    </form>
  );
}
