"""Small geometry helpers: polyline decoding, distances, interpolation."""

from __future__ import annotations

import math
from bisect import bisect_right
from typing import Sequence

EARTH_RADIUS_MI = 3958.8
LatLon = tuple[float, float]


def decode_polyline(encoded: str, precision: int = 6) -> list[LatLon]:
    """Decode a Google-style encoded polyline (Valhalla uses precision 6)."""
    factor = 10**precision
    coords: list[LatLon] = []
    index = lat = lon = 0
    while index < len(encoded):
        for is_lon in (False, True):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if is_lon:
                lon += delta
            else:
                lat += delta
        coords.append((lat / factor, lon / factor))
    return coords


def encode_polyline(coords: Sequence[LatLon], precision: int = 6) -> str:
    factor = 10**precision
    out: list[str] = []
    prev_lat = prev_lon = 0
    for lat, lon in coords:
        ilat, ilon = round(lat * factor), round(lon * factor)
        for delta in (ilat - prev_lat, ilon - prev_lon):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        prev_lat, prev_lon = ilat, ilon
    return "".join(out)


def haversine_mi(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_miles(points: Sequence[LatLon]) -> list[float]:
    """Distance from the start (miles) at every point of the line."""
    out = [0.0]
    for prev, cur in zip(points, points[1:]):
        out.append(out[-1] + haversine_mi(prev, cur))
    return out


def interpolate_along(points: Sequence[LatLon], cum: Sequence[float], mile: float) -> tuple[LatLon, int]:
    """Point at `mile` along the line, plus the index of the segment start."""
    if mile <= 0:
        return points[0], 0
    if mile >= cum[-1]:
        return points[-1], len(points) - 1
    i = bisect_right(cum, mile) - 1
    span = cum[i + 1] - cum[i]
    t = 0.0 if span == 0 else (mile - cum[i]) / span
    (lat1, lon1), (lat2, lon2) = points[i], points[i + 1]
    return (lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t), i


def downsample(points: Sequence[LatLon], cum: Sequence[float], step_mi: float) -> list[LatLon]:
    """Points roughly every `step_mi` miles, always keeping both ends."""
    if not points:
        return []
    out = [points[0]]
    next_mile = step_mi
    for p, m in zip(points, cum):
        if m >= next_mile:
            out.append(p)
            next_mile = m + step_mi
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out


def offset_point(origin: LatLon, bearing_deg: float, miles: float) -> LatLon:
    """Point `miles` away from `origin` in direction `bearing_deg`."""
    lat1, lon1 = math.radians(origin[0]), math.radians(origin[1])
    brg = math.radians(bearing_deg)
    d = miles / EARTH_RADIUS_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(math.sin(brg) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180


def bearing_deg(a: LatLon, b: LatLon) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360
