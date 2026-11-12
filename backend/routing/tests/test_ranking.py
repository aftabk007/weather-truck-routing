from routing.services.ranking import RouteSummary, explain, rank_routes
from routing.services.risk import Level


def summary(rid, severe=0.0, high=0.0, avg=0.5, hours=8.0, no_travel=0.0):
    return RouteSummary(
        route_id=rid,
        miles_by_level={Level.SEVERE: severe, Level.HIGH: high, Level.NO_TRAVEL: no_travel},
        avg_risk=avg,
        travel_s=hours * 3600,
    )


def ids(routes):
    return [r.route_id for r in rank_routes(routes)]


def test_fewest_severe_miles_wins_even_if_slower():
    assert ids([summary("A", severe=20, hours=7), summary("B", severe=5, hours=9)]) == ["B", "A"]


def test_high_miles_break_a_severe_tie():
    assert ids([summary("A", high=30), summary("B", high=10)]) == ["B", "A"]


def test_average_risk_breaks_a_high_tie():
    assert ids([summary("A", avg=1.2), summary("B", avg=0.4)]) == ["B", "A"]


def test_travel_time_is_the_last_tie_breaker():
    assert ids([summary("A", hours=9), summary("B", hours=8)]) == ["B", "A"]


def test_explain_names_the_deciding_rule():
    a, b = summary("A", severe=0, hours=9), summary("B", severe=12, hours=7)
    assert "Severe" in explain(a, b)


def test_no_travel_miles_lose_to_any_amount_of_severe():
    assert ids([summary("A", no_travel=1, severe=0), summary("B", severe=80)]) == ["B", "A"]


def test_float_noise_does_not_decide():
    assert ids([summary("A", severe=12.000001, hours=8), summary("B", severe=12.0, hours=7)]) == ["B", "A"]
