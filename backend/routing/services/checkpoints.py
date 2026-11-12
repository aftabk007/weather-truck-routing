"""Checkpoints every N miles along a route, with the truck's ETA at each one.

Driving time comes from the router. Optionally we add the federal hours-of-
service pauses for property-carrying drivers, because a 1,000-mile trip does
not arrive in 15 hours, and the weather must be read for the real arrival time:
- a 30-minute break after 8 hours of driving,
- a 10-hour rest after 11 hours of driving (which also resets the 8-hour clock).
The 14-hour on-duty window and the 70-hour/8-day cycle are not modelled.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Sequence

from .geo import LatLon, interpolate_along

DRIVE_LIMIT_H = 11.0
BREAK_AFTER_H = 8.0
BREAK_H = 0.5
REST_H = 10.0


def elapsed_hours(drive_h: float, rest_stops: bool = True) -> float:
    """Clock time needed to drive `drive_h` hours, including required pauses."""
    if not rest_stops or drive_h <= 0:
        return max(drive_h, 0.0)
    # A rest is only needed if driving continues after an 11-hour block ends.
    full_shifts = int((drive_h - 1e-9) // DRIVE_LIMIT_H)
    in_shift = drive_h - full_shifts * DRIVE_LIMIT_H
    breaks = full_shifts + (1 if in_shift > BREAK_AFTER_H else 0)
    return drive_h + full_shifts * REST_H + breaks * BREAK_H


@dataclass(frozen=True)
class Checkpoint:
    index: int
    mile: float
    lat: float
    lon: float
    drive_s: float
    eta: datetime
    covers_mi: float  # route miles this checkpoint stands for


def drive_seconds_at(cum_mi: Sequence[float], cum_s: Sequence[float], mile: float) -> float:
    """Driving seconds from the start to `mile`, interpolated between shape points."""
    if mile <= 0:
        return 0.0
    if mile >= cum_mi[-1]:
        return cum_s[-1]
    i = bisect_right(cum_mi, mile) - 1
    span = cum_mi[i + 1] - cum_mi[i]
    t = 0.0 if span == 0 else (mile - cum_mi[i]) / span
    return cum_s[i] + (cum_s[i + 1] - cum_s[i]) * t


def sample_checkpoints(
    points: Sequence[LatLon],
    cum_mi: Sequence[float],
    cum_s: Sequence[float],
    interval_mi: float,
    departure: datetime,
    rest_stops: bool = True,
) -> list[Checkpoint]:
    """Checkpoints at mile 0, N, 2N, … and at the destination.

    Each checkpoint stands for the route miles closest to it (half the gap to
    the previous checkpoint plus half the gap to the next), so the miles of all
    checkpoints add up to the route length.
    """
    total = cum_mi[-1]
    miles = [0.0]
    while miles[-1] + interval_mi < total - 1e-6:
        miles.append(miles[-1] + interval_mi)
    if total > 0:
        miles.append(total)

    out: list[Checkpoint] = []
    for i, mile in enumerate(miles):
        (lat, lon), _ = interpolate_along(points, cum_mi, mile)
        drive_s = drive_seconds_at(cum_mi, cum_s, mile)
        clock_h = elapsed_hours(drive_s / 3600, rest_stops)
        left = (mile - miles[i - 1]) / 2 if i > 0 else 0.0
        right = (miles[i + 1] - mile) / 2 if i + 1 < len(miles) else 0.0
        out.append(
            Checkpoint(
                index=i,
                mile=mile,
                lat=lat,
                lon=lon,
                drive_s=drive_s,
                eta=departure + timedelta(hours=clock_h),
                covers_mi=left + right,
            )
        )
    return out
