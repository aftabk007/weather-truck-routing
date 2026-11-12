"""Hourly forecasts from Open-Meteo for many points at once.

Points are snapped to a 0.1° grid (about 7 miles): forecast models are not
sharper than that, and nearby checkpoints of the three routes then share one
forecast. Each grid cell is fetched once per hour for the next 8 days and cached,
so moving the slider or asking again costs nothing. Open-Meteo's free plan allows
600 locations a minute, so requests go in chunks of 100 points.
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone

from django.conf import settings
from django.core.cache import cache

from .http import UpstreamError, get_json
from .risk import Weather

CELL_DEG = 0.1
CHUNK = 100
FORECAST_DAYS = 8
VARIABLES = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,weather_code"

Cell = tuple[float, float]


def cell_of(lat: float, lon: float, size: float = CELL_DEG) -> Cell:
    return (round(round(lat / size) * size, 4), round(round(lon / size) * size, 4))


@dataclass(frozen=True)
class Series:
    """Hourly values for one grid cell; index 0 is `t0` (UTC, whole hour)."""

    t0: datetime
    wind: list[float]
    gust: list[float]
    rain: list[float]  # rain + showers, inches in that hour
    snow: list[float]  # snowfall, inches in that hour
    code: list[int | None]

    def index_at(self, when: datetime) -> int | None:
        i = round((when - self.t0).total_seconds() / 3600)
        return i if 0 <= i < len(self.wind) else None

    def at(self, when: datetime) -> Weather | None:
        i = self.index_at(when)
        if i is None:
            return None
        return Weather(
            wind_mph=self.wind[i] or 0.0,
            gust_mph=self.gust[i] or 0.0,
            rain_in_hr=self.rain[i] or 0.0,
            snow_in_hr=self.snow[i] or 0.0,
            code=self.code[i],
        )


def _parse(item: dict) -> Series:
    h = item["hourly"]
    t0 = datetime.fromisoformat(h["time"][0]).replace(tzinfo=timezone.utc)
    rain = [(r or 0.0) + (s or 0.0) for r, s in zip(h["rain"], h["showers"])]
    return Series(
        t0=t0,
        wind=[v if v is not None else 0.0 for v in h["wind_speed_10m"]],
        gust=[v if v is not None else 0.0 for v in h["wind_gusts_10m"]],
        rain=rain,
        snow=[v if v is not None else 0.0 for v in h["snowfall"]],
        code=list(h.get("weather_code", [None] * len(rain))),
    )


def _cache_key(cell: Cell) -> str:
    hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    return f"wx:{hour}:{cell[0]}:{cell[1]}"


def _fetch_chunk(cells: list[Cell]) -> dict[Cell, Series]:
    params = {
        "latitude": ",".join(f"{c[0]:.4f}" for c in cells),
        "longitude": ",".join(f"{c[1]:.4f}" for c in cells),
        "hourly": VARIABLES,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "forecast_days": FORECAST_DAYS,
    }
    data = get_json(f"{settings.OPEN_METEO_URL}/v1/forecast", params, ttl=1800, name="Weather (Open-Meteo)")
    items = data if isinstance(data, list) else [data]
    if len(items) != len(cells):
        raise UpstreamError("Weather (Open-Meteo) returned the wrong number of points")
    return {cell: _parse(item) for cell, item in zip(cells, items)}


def forecasts(cells: set[Cell]) -> dict[Cell, Series]:
    """Hourly series for every cell, from cache where possible."""
    out: dict[Cell, Series] = {}
    missing: list[Cell] = []
    for c in cells:
        hit = cache.get(_cache_key(c))
        if hit is not None:
            out[c] = hit
        else:
            missing.append(c)
    chunks = [missing[i : i + CHUNK] for i in range(0, len(missing), CHUNK)]
    if chunks:
        with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as pool:
            for result in pool.map(_fetch_chunk, chunks):
                for c, s in result.items():
                    cache.set(_cache_key(c), s, 3600)
                    out[c] = s
    return out


def hours_from(start: datetime, count: int) -> list[datetime]:
    base = start.replace(minute=0, second=0, microsecond=0)
    return [base.fromtimestamp(base.timestamp() + 3600 * i, tz=timezone.utc) for i in range(count)]


def grid_spacing(area_deg2: float, max_cells: int) -> float:
    """Grid step (degrees) so a corridor of this area holds at most `max_cells`."""
    step = math.sqrt(area_deg2 / max_cells) if area_deg2 > 0 else CELL_DEG
    return max(CELL_DEG, math.ceil(step / CELL_DEG) * CELL_DEG)
