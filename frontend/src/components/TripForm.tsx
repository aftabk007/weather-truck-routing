import { useState } from "react";
import type { Place, PlanRequest } from "../api";
import { PlaceInput } from "./PlaceInput";

const DALLAS: Place = { label: "Dallas, Texas, US", lat: 32.7767, lon: -96.797 };
const MEMPHIS: Place = { label: "Memphis, Tennessee, US", lat: 35.1495, lon: -90.049 };

/** Local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">, one hour from now. */
function inOneHour(): string {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

type Props = { busy: boolean; onSubmit: (req: PlanRequest) => void };

export function TripForm({ busy, onSubmit }: Props) {
  const [origin, setOrigin] = useState<Place | null>(DALLAS);
  const [destination, setDestination] = useState<Place | null>(MEMPHIS);
  const [departure, setDeparture] = useState(inOneHour);
  const [load, setLoad] = useState(42000);
  const [intervalMi, setIntervalMi] = useState<10 | 25 | 50>(25);
  const [rest, setRest] = useState(true);

  const ready = origin && destination && departure && load >= 0;

  return (
    <form
      className="trip-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit({
          origin,
          destination,
          departure: new Date(departure).toISOString(),
          load_lb: load,
          interval_mi: intervalMi,
          rest_stops: rest,
        });
      }}
    >
      <PlaceInput label="Origin" value={origin} onChange={setOrigin} placeholder="City or address" />
      <button
        type="button"
        className="swap"
        title="Swap origin and destination"
        onClick={() => {
          setOrigin(destination);
          setDestination(origin);
        }}
      >
        ⇅
      </button>
      <PlaceInput label="Destination" value={destination} onChange={setDestination} placeholder="City or address" />

      <div className="row">
        <label className="field">
          <span>Departure</span>
          <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} required />
        </label>
        <label className="field">
          <span>Load weight (lb)</span>
          <input
            type="number"
            min={0}
            max={200000}
            step={500}
            value={load}
            onChange={(e) => setLoad(Number(e.target.value))}
            required
          />
        </label>
      </div>

      <div className="row">
        <div className="field">
          <span>Weather check every</span>
          <div className="segmented" role="radiogroup">
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
        </div>
        <label className="check" title="30-min break after 8 h driving, 10-h rest after 11 h (FMCSA)">
          <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} />
          Add driver rest stops
        </label>
      </div>

      <button className="primary" type="submit" disabled={!ready || busy}>
        {busy ? "Planning…" : "Find the safest route"}
      </button>
    </form>
  );
}
