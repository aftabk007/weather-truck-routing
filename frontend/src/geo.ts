import type { Checkpoint } from "./api";

export type LngLat = [number, number];

/** Decode a precision-6 encoded polyline (Valhalla) into [lon, lat] pairs for the map. */
export function decodePolyline(encoded: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (let k = 0; k < 2; k++) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += delta;
      else lon += delta;
    }
    out.push([lon / factor, lat / factor]);
  }
  return out;
}

const R_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMi(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

export function cumulativeMiles(line: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversineMi(line[i - 1], line[i]));
  return out;
}

/** Point at `mile` along the line (binary search on cumulative miles). */
export function pointAtMile(line: LngLat[], cum: number[], mile: number): LngLat {
  if (mile <= 0) return line[0];
  const total = cum[cum.length - 1];
  if (mile >= total) return line[line.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= mile) lo = mid;
    else hi = mid;
  }
  const t = (mile - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [line[lo][0] + (line[hi][0] - line[lo][0]) * t, line[lo][1] + (line[hi][1] - line[lo][1]) * t];
}

/* Hours-of-service pauses, the same numbers as backend/routing/services/checkpoints.py:
   drive 8 h, 30-min break, drive 3 h more (11 h), 10-h rest, repeat. */
const DRIVE_LIMIT_H = 11;
const BREAK_AFTER_H = 8;
const BREAK_H = 0.5;
const REST_H = 10;
const SHIFT_H = DRIVE_LIMIT_H + BREAK_H + REST_H; // 21.5 h of clock time per full shift

export type TruckState = "before" | "driving" | "break" | "rest" | "arrived";

/** Driving hours done after `clockH` hours since departure: the inverse of the
 * server's elapsed_hours(). Flat during the break and the rest, so the truck
 * stands still exactly while the driver is off the road. */
export function drivenHours(clockH: number, rest: boolean): { driven: number; state: "driving" | "break" | "rest" } {
  if (!rest) return { driven: clockH, state: "driving" };
  const k = Math.floor(clockH / SHIFT_H);
  const r = clockH - k * SHIFT_H;
  const base = k * DRIVE_LIMIT_H;
  if (r <= BREAK_AFTER_H) return { driven: base + r, state: "driving" };
  if (r <= BREAK_AFTER_H + BREAK_H) return { driven: base + BREAK_AFTER_H, state: "break" };
  if (r <= DRIVE_LIMIT_H + BREAK_H) return { driven: base + r - BREAK_H, state: "driving" };
  return { driven: base + DRIVE_LIMIT_H, state: "rest" };
}

/** Route mile and state of the truck at time `t` (epoch ms). Driving time maps
 * to miles through the checkpoints' driving times, so speed only changes where
 * the road really changes (city vs highway), not because of rest stops. */
export function truckAt(cps: Checkpoint[], departureMs: number, rest: boolean, t: number): { mile: number; state: TruckState } {
  if (t <= departureMs) return { mile: 0, state: "before" };
  const { driven, state } = drivenHours((t - departureMs) / 3600_000, rest);
  const ds = driven * 3600;
  const last = cps[cps.length - 1];
  if (ds >= last.drive_s) return { mile: last.mile, state: "arrived" };
  let i = 0;
  while (cps[i + 1].drive_s < ds) i++;
  const span = cps[i + 1].drive_s - cps[i].drive_s;
  const f = span > 0 ? (ds - cps[i].drive_s) / span : 0;
  return { mile: cps[i].mile + (cps[i + 1].mile - cps[i].mile) * f, state };
}

/** Compass bearing (degrees, 0 = north) from a to b. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const [lon1, lat1, lon2, lat2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bounds(points: LngLat[]): [LngLat, LngLat] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
