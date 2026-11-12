from datetime import datetime, timedelta, timezone

import pytest

from routing.services.checkpoints import elapsed_hours, sample_checkpoints
from routing.services.geo import cumulative_miles, decode_polyline, encode_polyline

DEPART = datetime(2026, 11, 13, 6, 0, tzinfo=timezone.utc)


def straight_line(n=101, miles_per_deg=69.0):
    """A north-going line about 100 miles long, driven at 50 mph."""
    pts = [(30.0 + i * (100 / miles_per_deg) / (n - 1), -95.0) for i in range(n)]
    cum = cumulative_miles(pts)
    return pts, cum, [m / 50 * 3600 for m in cum]


def test_polyline_round_trip():
    pts = [(32.7767, -96.797), (34.6, -93.1), (35.1495, -90.049)]
    back = decode_polyline(encode_polyline(pts))
    assert all(abs(a - b) < 1e-6 for p, q in zip(pts, back) for a, b in zip(p, q))


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoints_every_interval_plus_destination(interval):
    pts, cum, secs = straight_line()
    cps = sample_checkpoints(pts, cum, secs, interval, DEPART, rest_stops=False)
    assert cps[0].mile == 0
    assert cps[-1].mile == pytest.approx(cum[-1])
    assert all(b.mile - a.mile <= interval + 1e-6 for a, b in zip(cps, cps[1:]))
    assert sum(c.covers_mi for c in cps) == pytest.approx(cum[-1])


def test_eta_follows_driving_time():
    pts, cum, secs = straight_line()
    cps = sample_checkpoints(pts, cum, secs, 25, DEPART, rest_stops=False)
    assert cps[1].eta == DEPART + timedelta(minutes=30)  # 25 mi at 50 mph


@pytest.mark.parametrize(
    "drive_h, clock_h",
    [(0, 0), (5, 5), (8, 8), (8.5, 9.0), (11, 11.5), (12, 12 + 0.5 + 10), (22, 22 + 1 + 10), (23, 23 + 1 + 20)],
)
def test_hours_of_service_pauses(drive_h, clock_h):
    assert elapsed_hours(drive_h, rest_stops=True) == pytest.approx(clock_h)


def test_no_pauses_when_switched_off():
    assert elapsed_hours(30, rest_stops=False) == 30
