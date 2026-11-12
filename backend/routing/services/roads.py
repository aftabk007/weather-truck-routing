"""Road names for route labels ("via CA-49").

Alternative routes share most of their highways (every Sacramento → Reno route
uses I-80), so labelling each route by its longest roads makes all three look
the same. Instead each route is labelled by the roads that set it apart: the
miles it drives on a road minus the most any other route drives on it.
"""

from __future__ import annotations

import re

_DIRECTION = re.compile(r"\s+(north|south|east|west|northbound|southbound|eastbound|westbound|n|s|e|w|nb|sb|eb|wb)$", re.I)
_NUMBERED = re.compile(r"^(interstate|i|us|sr|state route|route|highway|hwy|[a-z]{2})[\s-]+(\d+[a-z]?)\b(.*)$", re.I)
_PREFIX = {"INTERSTATE": "I", "STATE ROUTE": "SR", "ROUTE": "SR", "HIGHWAY": "Hwy", "HWY": "Hwy"}

HIGHWAY_WEIGHT = 1.5  # prefer a highway over a local street that differs by a similar amount


def normalize_road(name: str) -> str:
    """'I 80 East' / 'Interstate 80' -> 'I-80'; 'CA 49' -> 'CA-49'; 'US 50 West' -> 'US-50'."""
    n = _DIRECTION.sub("", name.strip())
    m = _NUMBERED.match(n)
    if not m:
        return n
    prefix = m.group(1).upper()
    prefix = _PREFIX.get(prefix, prefix)
    return f"{prefix}-{m.group(2).upper()}{m.group(3)}".strip()


def is_highway(name: str) -> bool:
    return bool(re.match(r"^(I|US|SR|Hwy|[A-Z]{2})-\d", name))


def longest_roads(miles: dict[str, float], top: int = 2) -> list[str]:
    ranked = sorted(miles.items(), key=lambda kv: -kv[1] * (HIGHWAY_WEIGHT if is_highway(kv[0]) else 1))
    return [n for n, _ in ranked[:top]]


def distinct_vias(road_miles: list[dict[str, float]], top: int = 2, min_mi: float = 3.0) -> list[list[str]]:
    """For each route, the roads it uses clearly more than any other route.

    Falls back to the route's longest roads when nothing sets it apart
    (a single route, or two routes on the same roads).
    """
    out: list[list[str]] = []
    for i, mine in enumerate(road_miles):
        others = [m for j, m in enumerate(road_miles) if j != i]

        def extra(name: str) -> float:
            return mine[name] - max((o.get(name, 0.0) for o in others), default=0.0)

        scored = [(n, extra(n)) for n in mine]
        scored = [(n, s) for n, s in scored if s >= min_mi]
        scored.sort(key=lambda ns: -ns[1] * (HIGHWAY_WEIGHT if is_highway(ns[0]) else 1))
        out.append([n for n, _ in scored[:top]] or longest_roads(mine, top))
    return out
