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

/** Route mile where the truck is at time `t`, from the checkpoint ETAs (null = not on the road). */
export function mileAtTime(checkpoints: Checkpoint[], t: number): { mile: number; state: "before" | "driving" | "arrived" } {
  const times = checkpoints.map((c) => Date.parse(c.eta));
  if (t <= times[0]) return { mile: 0, state: "before" };
  const last = checkpoints.length - 1;
  if (t >= times[last]) return { mile: checkpoints[last].mile, state: "arrived" };
  let i = 0;
  while (times[i + 1] < t) i++;
  const f = (t - times[i]) / (times[i + 1] - times[i] || 1);
  return { mile: checkpoints[i].mile + (checkpoints[i + 1].mile - checkpoints[i].mile) * f, state: "driving" };
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
