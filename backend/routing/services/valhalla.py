"""Truck routes from Valhalla (OpenStreetMap), always returning up to 3 options.

Valhalla's own alternatives come first. The public server sometimes returns only
one or two truck routes, so we fill the rest with detours: route through a point
placed to the side of the fastest route's middle, and keep the result only if it
is really different (not mostly the same roads) and not absurdly long.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from django.conf import settings

from .geo import LatLon, bearing_deg, cumulative_miles, decode_polyline, downsample, interpolate_along, offset_point
from .http import UpstreamError, post_json
from .roads import longest_roads, normalize_road

MAX_DETOUR_RATIO = 1.6  # a detour may be at most 60% longer than the fastest route
MAX_OVERLAP = 0.80  # a new route must share less than 80% of its miles with an existing one


@dataclass
class Route:
    points: list[LatLon]
    cum_mi: list[float]
    cum_s: list[float]
    distance_mi: float
    drive_s: float
    via: list[str] = field(default_factory=list)
    road_miles: dict[str, float] = field(default_factory=dict)  # normalised road name -> miles driven on it
    source: str = "valhalla"  # "valhalla" or "detour"


def _request(locations: list[dict], truck: dict, alternates: int) -> dict:
    body = {
        "locations": locations,
        "costing": "truck",
        "costing_options": {"truck": truck},
        "units": "miles",
        "directions_type": "maneuvers",
        "alternates": alternates,
    }
    data = post_json(f"{settings.VALHALLA_URL}/route", body, ttl=6 * 3600, name="Routing (Valhalla)")
    if not isinstance(data, dict) or "trip" not in data:
        raise UpstreamError("Routing (Valhalla) returned no trip")
    return data


def _route_from_trip(trip: dict, source: str) -> Route:
    points: list[LatLon] = []
    cum_s: list[float] = []
    names: dict[str, float] = {}
    for leg in trip["legs"]:
        shape = decode_polyline(leg["shape"])
        offset = len(points) - 1 if points else 0
        leg_points = shape[1:] if points else shape
        points.extend(leg_points)
        leg_cum = cumulative_miles(shape)
        start_s = cum_s[-1] if cum_s else 0.0
        times = [start_s] * len(shape)
        for m in leg.get("maneuvers", []):
            b, e = m["begin_shape_index"], m["end_shape_index"]
            seg = leg_cum[e] - leg_cum[b]
            for k in range(b + 1, e + 1):
                share = (leg_cum[k] - leg_cum[k - 1]) / seg if seg > 0 else 0
                times[k] = times[k - 1] + m.get("time", 0) * share
            for name in m.get("street_names", []) or []:
                road = normalize_road(name)
                names[road] = names.get(road, 0.0) + m.get("length", 0.0)
        cum_s.extend(times[1:] if offset else times)
    cum_mi = cumulative_miles(points)
    return Route(
        points=points,
        cum_mi=cum_mi,
        cum_s=cum_s,
        distance_mi=cum_mi[-1],
        drive_s=cum_s[-1],
        via=longest_roads(names),
        road_miles=names,
        source=source,
    )


def _cells(route: Route, step_mi: float = 0.5) -> set[tuple[int, int]]:
    pts = downsample(route.points, route.cum_mi, step_mi)
    return {(round(lat / 0.02), round(lon / 0.02)) for lat, lon in pts}


def _overlap(candidate: Route, other_cells: set[tuple[int, int]]) -> float:
    pts = downsample(candidate.points, candidate.cum_mi, 2.0)
    if not pts:
        return 1.0
    hits = 0
    for lat, lon in pts:
        ci, cj = round(lat / 0.02), round(lon / 0.02)
        if any((ci + di, cj + dj) in other_cells for di in (-1, 0, 1) for dj in (-1, 0, 1)):
            hits += 1
    return hits / len(pts)


def _is_distinct(candidate: Route, chosen: list[Route], fastest_mi: float) -> bool:
    if candidate.distance_mi > fastest_mi * MAX_DETOUR_RATIO:
        return False
    return all(_overlap(candidate, _cells(r)) < MAX_OVERLAP for r in chosen)


def _detour_points(fastest: Route) -> list[LatLon]:
    """Side points left and right of the route at 1/2, 1/3 and 2/3 of the way."""
    total = fastest.distance_mi
    side = min(max(0.15 * total, 10.0), 120.0)
    out = []
    for frac, sign in ((0.5, 1), (0.5, -1), (0.33, 1), (0.67, -1), (0.33, -1), (0.67, 1)):
        here, _ = interpolate_along(fastest.points, fastest.cum_mi, total * frac)
        a, _ = interpolate_along(fastest.points, fastest.cum_mi, total * max(frac - 0.05, 0))
        b, _ = interpolate_along(fastest.points, fastest.cum_mi, total * min(frac + 0.05, 1))
        out.append(offset_point(here, bearing_deg(a, b) + 90 * sign, side))
    return out


def truck_routes(origin: LatLon, destination: LatLon, truck: dict, want: int = 3) -> list[Route]:
    """Up to `want` routes for a truck described by Valhalla costing options
    (see trucks.TruckSpec.costing_options)."""
    start = {"lat": origin[0], "lon": origin[1]}
    end = {"lat": destination[0], "lon": destination[1]}
    data = _request([start, end], truck, alternates=want - 1)
    trips = [data["trip"]] + [a["trip"] for a in data.get("alternates", []) if "trip" in a]
    routes = [_route_from_trip(t, "valhalla") for t in trips]
    routes.sort(key=lambda r: r.drive_s)
    fastest = routes[0]

    chosen: list[Route] = []
    for r in routes:
        if not chosen or _is_distinct(r, chosen, fastest.distance_mi):
            chosen.append(r)

    if len(chosen) < want:
        candidates = _detour_points(fastest)
        with ThreadPoolExecutor(max_workers=2) as pool:
            # Two side points at a time, so we stop asking once we have enough.
            for i in range(0, len(candidates), 2):
                for candidate in pool.map(lambda p: _via_route(start, p, end, truck), candidates[i : i + 2]):
                    if candidate and len(chosen) < want and _is_distinct(candidate, chosen, fastest.distance_mi):
                        chosen.append(candidate)
                if len(chosen) >= want:
                    break

    return sorted(chosen, key=lambda r: r.drive_s)[:want]


def _via_route(start: dict, p: LatLon, end: dict, truck: dict) -> Route | None:
    """Route that passes a side point. The public server limits multi-stop
    requests to 1,500 km, so long trips are routed as two halves and joined."""
    via = {"lat": p[0], "lon": p[1], "type": "through", "radius": 25000}
    try:
        return _route_from_trip(_request([start, via, end], truck, alternates=0)["trip"], "detour")
    except UpstreamError as exc:
        if "max distance" not in str(exc):
            return None  # e.g. no road near the side point; the next one may work
    try:
        first = _request([start, via], truck, alternates=0)["trip"]
        second = _request([{"lat": p[0], "lon": p[1], "radius": 25000}, end], truck, alternates=0)["trip"]
    except UpstreamError:
        return None
    return _route_from_trip({"legs": first["legs"] + second["legs"]}, "detour")
