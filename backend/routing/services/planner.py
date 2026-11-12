"""Builds a full trip plan: 3 truck routes, weather at each checkpoint at the
truck's arrival time, risk per checkpoint, summaries and the recommendation."""

from __future__ import annotations

from datetime import datetime, timedelta

from .checkpoints import elapsed_hours, sample_checkpoints
from .geo import LatLon, downsample, encode_polyline
from .ranking import RouteSummary, explain, rank_routes
from .risk import Level, assess
from .trucks import TruckSpec
from .valhalla import Route, truck_routes
from .weather import cell_of, forecasts

ROUTE_IDS = "ABC"


def _checkpoint_json(cp, wx, a) -> dict:
    base = {
        "index": cp.index,
        "mile": round(cp.mile, 1),
        "lat": round(cp.lat, 5),
        "lon": round(cp.lon, 5),
        "eta": cp.eta.isoformat(),
        "covers_mi": round(cp.covers_mi, 2),
    }
    if wx is None:
        return base | {"level": None, "level_name": "No forecast", "reasons": ["Beyond the forecast range"]}
    return base | {
        "wind_mph": round(wx.wind_mph, 1),
        "gust_mph": round(wx.gust_mph, 1),
        "rain_in_hr": round(wx.rain_in_hr, 3),
        "snow_in_hr": round(wx.snow_in_hr, 2),
        "weather_code": wx.code,
        "level": int(a.level),
        "level_name": a.level.label,
        "reasons": a.reasons,
    }


def _summarize(route_id: str, checkpoints: list[dict], travel_s: float) -> RouteSummary:
    miles = {lvl: 0.0 for lvl in Level}
    unknown = weighted = known = 0.0
    for cp in checkpoints:
        if cp["level"] is None:
            unknown += cp["covers_mi"]
            continue
        miles[Level(cp["level"])] += cp["covers_mi"]
        weighted += cp["level"] * cp["covers_mi"]
        known += cp["covers_mi"]
    return RouteSummary(
        route_id=route_id,
        miles_by_level=miles,
        avg_risk=weighted / known if known else 0.0,
        travel_s=travel_s,
        unknown_mi=unknown,
    )


def plan_trip(
    origin: LatLon,
    destination: LatLon,
    departure: datetime,
    load_lb: float,
    interval_mi: int,
    truck: TruckSpec,
    rest_stops: bool = True,
) -> dict:
    routes: list[Route] = truck_routes(origin, destination, truck.costing_options(load_lb))

    sampled = {
        rid: sample_checkpoints(r.points, r.cum_mi, r.cum_s, interval_mi, departure, rest_stops)
        for rid, r in zip(ROUTE_IDS, routes)
    }
    series = forecasts({cell_of(cp.lat, cp.lon) for cps in sampled.values() for cp in cps})

    out_routes, summaries = [], []
    for rid, route in zip(ROUTE_IDS, routes):
        cps = []
        for cp in sampled[rid]:
            wx = series[cell_of(cp.lat, cp.lon)].at(cp.eta)
            cps.append(_checkpoint_json(cp, wx, assess(wx, load_lb) if wx else None))
        travel_s = elapsed_hours(route.drive_s / 3600, rest_stops) * 3600
        summary = _summarize(rid, cps, travel_s)
        summaries.append(summary)
        step = max(0.05, route.distance_mi / 6000)
        out_routes.append(
            {
                "id": rid,
                "via": route.via,
                "source": route.source,
                "distance_mi": round(route.distance_mi, 1),
                "drive_s": round(route.drive_s),
                "travel_s": round(travel_s),
                "arrival": (departure + timedelta(seconds=travel_s)).isoformat(),
                "polyline": encode_polyline(downsample(route.points, route.cum_mi, step)),
                "checkpoints": cps,
                "summary": {
                    "miles_by_level": {lvl.label: round(summary.miles(lvl), 1) for lvl in Level},
                    "avg_risk": round(summary.avg_risk, 2),
                    "worst_level": max((c["level"] for c in cps if c["level"] is not None), default=None),
                    "unknown_mi": round(summary.unknown_mi, 1),
                },
            }
        )

    ranked = rank_routes(summaries)
    order = {s.route_id: i + 1 for i, s in enumerate(ranked)}
    for r in out_routes:
        r["rank"] = order[r["id"]]
    best = ranked[0]
    corridor = [
        [round(lat, 4), round(lon, 4)]
        for r in routes
        for lat, lon in downsample(r.points, r.cum_mi, max(5.0, r.distance_mi / 300))
    ]
    return {
        "departure": departure.isoformat(),
        "load_lb": load_lb,
        "truck": truck.as_json(load_lb),
        "interval_mi": interval_mi,
        "rest_stops": rest_stops,
        "routes": out_routes,
        "recommended": best.route_id,
        "reason": explain(best, ranked[1] if len(ranked) > 1 else None),
        "corridor": corridor,
    }
