"""Pick the recommended route.

The brief's order of preference:
  1. fewest Severe miles, 2. fewest High miles, 3. lowest average risk,
  4. shortest travel time.

`rank_key` turns a route summary into a tuple of (label, value) pairs. Python
compares tuples left to right, so sorting by this key applies the rules in
order, and the labels let us explain *which* rule decided the winner.
"""

from __future__ import annotations

from dataclasses import dataclass

from .risk import Level

Key = tuple[tuple[str, float], ...]


@dataclass(frozen=True)
class RouteSummary:
    route_id: str
    miles_by_level: dict[Level, float]  # route miles at each risk level
    avg_risk: float  # mile-weighted average level, 0 (Low) … 4 (No Travel)
    travel_s: float  # clock time to arrive, rest stops included
    unknown_mi: float = 0.0  # miles beyond the forecast range (no weather data)

    def miles(self, level: Level) -> float:
        return self.miles_by_level.get(level, 0.0)


def rank_key(s: RouteSummary) -> Key:
    """Sort key for one route: smaller is better.

    No Travel miles come first: the brief's list starts at Severe, but a route
    that crosses No Travel weather cannot be driven at all, so it must never beat
    a route that is only Severe. Then the brief's four rules in order.
    Miles are rounded to 0.1 and the average to 0.01, so float noise
    (12.000001 vs 12.0) does not decide; real ties fall through to the next rule.
    """
    return (
        ("No Travel miles", round(s.miles(Level.NO_TRAVEL), 1)),
        ("Severe miles", round(s.miles(Level.SEVERE), 1)),
        ("High miles", round(s.miles(Level.HIGH), 1)),
        ("Average risk", round(s.avg_risk, 2)),
        ("Travel time", round(s.travel_s)),
    )


def rank_routes(summaries: list[RouteSummary]) -> list[RouteSummary]:
    return sorted(summaries, key=rank_key)


def explain(best: RouteSummary, runner_up: RouteSummary | None) -> str:
    """One sentence on why `best` won: the first rule where it beats the runner-up."""
    if runner_up is None:
        return "Only one route was found."
    for (label, mine), (_, theirs) in zip(rank_key(best), rank_key(runner_up)):
        if mine != theirs:
            unit = "" if "risk" in label.lower() else (" h" if "time" in label.lower() else " mi")
            fmt = (lambda v: f"{v / 3600:.1f}") if "time" in label.lower() else (lambda v: f"{v:.1f}")
            return f"{label}: {fmt(mine)}{unit} vs {fmt(theirs)}{unit} on Route {runner_up.route_id}."
    return f"Same risk and time as Route {runner_up.route_id}; picked the first."
