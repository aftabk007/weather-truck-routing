"""Weather along the trip corridor for the next 0–48 hours.

A regular grid covers everything within `buffer_mi` of any route. Every cell
gets 49 hourly values (risk level with the load rules, wind, rain, snow), so the
browser can move the slider without asking the server again.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from .geo import LatLon, haversine_mi
from .risk import assess
from .weather import cell_of, forecasts, grid_spacing, hours_from

HOURS = 49
MAX_CELLS = 260
MI_PER_DEG_LAT = 69.0


PROBE_STEP = 0.2


def _grid(corridor: list[LatLon], buffer_mi: float, step: float) -> list[LatLon]:
    """Grid points `step` degrees apart that lie within `buffer_mi` of the corridor."""
    lats = [p[0] for p in corridor]
    lons = [p[1] for p in corridor]
    mid_lat = (min(lats) + max(lats)) / 2
    pad_lat = buffer_mi / MI_PER_DEG_LAT
    pad_lon = buffer_mi / (MI_PER_DEG_LAT * max(math.cos(math.radians(mid_lat)), 0.2))
    lat0 = math.floor((min(lats) - pad_lat) / step) * step
    lon0 = math.floor((min(lons) - pad_lon) / step) * step
    rows = int((max(lats) + pad_lat - lat0) / step) + 1
    cols = int((max(lons) + pad_lon - lon0) / step) + 1

    # Bucket the corridor points by 1° so each grid point checks only nearby ones.
    buckets: dict[tuple[int, int], list[LatLon]] = {}
    for p in corridor:
        buckets.setdefault((math.floor(p[0]), math.floor(p[1])), []).append(p)

    cells: list[LatLon] = []
    for i in range(rows):
        lat = lat0 + i * step
        for j in range(cols):
            lon = lon0 + j * step
            near = (
                q
                for di in (-1, 0, 1)
                for dj in (-1, 0, 1)
                for q in buckets.get((math.floor(lat) + di, math.floor(lon) + dj), ())
            )
            if any(haversine_mi((lat, lon), q) <= buffer_mi for q in near):
                cells.append(cell_of(lat, lon))
    return list(dict.fromkeys(cells))


def corridor_cells(corridor: list[LatLon], buffer_mi: float, max_cells: int = MAX_CELLS) -> tuple[list[LatLon], float]:
    """Pick the finest grid step that keeps the corridor under `max_cells` points.

    The corridor's real area is measured with a quick coarse grid first, so
    routes that share roads are not counted twice.
    """
    area_deg2 = len(_grid(corridor, buffer_mi, PROBE_STEP)) * PROBE_STEP**2
    step = grid_spacing(area_deg2, max_cells)
    return _grid(corridor, buffer_mi, step), step


def corridor_heatmap(corridor: list[LatLon], load_lb: float, buffer_mi: float = 40.0) -> dict:
    cells, step = corridor_cells(corridor, buffer_mi)
    series = forecasts(set(cells))
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    hours = hours_from(start, HOURS)

    out = []
    for c in cells:
        s = series[c]
        risk, wind, rain, snow = [], [], [], []
        for h in hours:
            wx = s.at(h)
            if wx is None:
                for values in (risk, wind, rain, snow):
                    values.append(None)
                continue
            risk.append(int(assess(wx, load_lb).level))
            wind.append(round(wx.wind_mph, 1))
            rain.append(round(wx.rain_in_hr, 3))
            snow.append(round(wx.snow_in_hr, 2))
        out.append({"lat": c[0], "lon": c[1], "risk": risk, "wind": wind, "rain": rain, "snow": snow})
    return {"start": start.isoformat(), "hours": HOURS, "spacing_deg": step, "cells": out}
