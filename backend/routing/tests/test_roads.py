import pytest

from routing.services.roads import distinct_vias, is_highway, normalize_road


@pytest.mark.parametrize(
    "raw, clean",
    [
        ("I 80 East", "I-80"),
        ("I 80", "I-80"),
        ("Interstate 80", "I-80"),
        ("US 50 West", "US-50"),
        ("CA 49", "CA-49"),
        ("I 5 Truck", "I-5 Truck"),
        ("Westside Freeway", "Westside Freeway"),
        ("Main Street North", "Main Street"),
    ],
)
def test_normalize_road(raw, clean):
    assert normalize_road(raw) == clean


def test_highway_detection():
    assert is_highway("I-80") and is_highway("US-50") and is_highway("CA-49")
    assert not is_highway("Westside Freeway")


def test_labels_name_what_sets_each_route_apart():
    # All three share I-80; B detours on CA-49, C on US-50.
    a = {"I-80": 120.0, "Main Street": 2.0}
    b = {"I-80": 80.0, "CA-49": 45.0}
    c = {"I-80": 60.0, "US-50": 70.0, "Pioneer Trail": 8.0}
    via = distinct_vias([a, b, c])
    assert via[0] == ["I-80"]  # A uses I-80 40 mi more than anyone else
    assert via[1] == ["CA-49"]
    assert via[2][0] == "US-50"
    assert len({tuple(v) for v in via}) == 3  # three different labels


def test_single_route_falls_back_to_its_longest_roads():
    assert distinct_vias([{"I-80": 100.0, "CA-49": 10.0}]) == [["I-80", "CA-49"]]


def test_identical_routes_still_get_a_label():
    same = {"I-5": 200.0}
    assert distinct_vias([same, dict(same)]) == [["I-5"], ["I-5"]]
