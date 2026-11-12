import { useEffect, useState } from "react";
import { api, type TruckChoice, type TruckSpec, type TruckType } from "../api";

const ICON: Record<TruckType, string> = { dry_van: "🚛", reefer: "❄️", flatbed: "🪵", box_truck: "📦", tanker: "🛢️" };
const SHORT: Record<TruckType, string> = { dry_van: "Dry van", reefer: "Reefer", flatbed: "Flatbed", box_truck: "Box", tanker: "Tanker" };

/** 13.5 -> 13'6" */
export const feetInches = (ft: number) => {
  let f = Math.floor(ft);
  let i = Math.round((ft - f) * 12);
  if (i === 12) [f, i] = [f + 1, 0];
  return `${f}'${i}"`;
};

type Props = { value: TruckChoice; onChange: (t: TruckChoice) => void; loadLb: number };

/** Truck type buttons plus the sizes the router uses (all editable). */
export function TruckPicker({ value, onChange, loadLb }: Props) {
  const [presets, setPresets] = useState<TruckSpec[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.trucks().then((r) => setPresets(r.presets)).catch(() => setPresets([]));
  }, []);

  const base = presets.find((p) => p.type === value.type);
  if (!base) return <div className="field"><span>Truck</span><div className="muted">Loading truck types…</div></div>;
  const spec = { ...base, ...value };
  const gross = spec.empty_lb + loadLb;
  const set = (k: keyof TruckSpec, v: number | boolean) => onChange({ ...value, [k]: v });
  const num = (k: "height_ft" | "width_ft" | "length_ft" | "empty_lb" | "axle_count", step: number, unit: string) => (
    <label className="mini">
      <input type="number" step={step} value={spec[k]} onChange={(e) => set(k, Number(e.target.value))} />
      <span>{unit}</span>
    </label>
  );

  return (
    <div className="field truck-picker">
      <span>Truck</span>
      <div className="truck-types" role="radiogroup" aria-label="Truck type">
        {presets.map((p) => (
          <button
            key={p.type}
            type="button"
            role="radio"
            aria-checked={p.type === value.type}
            className={p.type === value.type ? "on" : ""}
            title={p.label}
            onClick={() => {
              onChange({ type: p.type });
              setEditing(false);
            }}
          >
            <i aria-hidden>{ICON[p.type]}</i>
            {SHORT[p.type]}
          </button>
        ))}
      </div>
      <div className="truck-dims">
        <span title="Height, width, length used to avoid low bridges and size limits">
          {feetInches(spec.height_ft)} high · {feetInches(spec.width_ft)} wide · {spec.length_ft} ft long · {spec.axle_count} axles
          {spec.hazmat ? " · hazmat" : ""}
        </span>
        <button type="button" className="link" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit sizes"}
        </button>
      </div>
      {editing && (
        <div className="truck-edit">
          {num("height_ft", 0.25, "ft high")}
          {num("width_ft", 0.25, "ft wide")}
          {num("length_ft", 1, "ft long")}
          {num("axle_count", 1, "axles")}
          {num("empty_lb", 500, "lb empty")}
          <label className="check">
            <input type="checkbox" checked={spec.hazmat} onChange={(e) => set("hazmat", e.target.checked)} />
            Hazmat
          </label>
        </div>
      )}
      <div className={`gross ${gross > 80000 ? "warn" : ""}`}>
        Gross {Math.round(gross).toLocaleString()} lb (empty {spec.empty_lb.toLocaleString()} + load {loadLb.toLocaleString()})
        {gross > 80000 ? " · over the 80,000 lb federal limit, needs a permit" : ""}
      </div>
    </div>
  );
}
