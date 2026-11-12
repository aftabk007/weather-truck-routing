import os

import pytest

from routing.services import valhalla
from routing.services.trucks import FEDERAL_GROSS_LIMIT_LB, PRESETS, spec_from_request

LIVE = os.environ.get("LIVE_TESTS") == "1"


def test_every_preset_has_sane_sizes():
    for spec in PRESETS.values():
        assert 6 <= spec.height_ft <= 14
        assert spec.width_ft <= 8.5  # federal width limit
        assert spec.axle_count >= 2


def test_costing_options_are_metric_and_use_gross_weight():
    opts = PRESETS["dry_van"].costing_options(load_lb=42_000)
    assert opts["height"] == pytest.approx(4.11, abs=0.01)  # 13'6"
    assert opts["width"] == pytest.approx(2.59, abs=0.01)  # 8'6"
    assert opts["weight"] == pytest.approx((35_000 + 42_000) / 2204.62, abs=0.01)
    assert opts["axle_load"] == pytest.approx(opts["weight"] / 5, abs=0.01)
    assert opts["hazmat"] is False


def test_tanker_is_hazmat():
    assert PRESETS["tanker"].costing_options(10_000)["hazmat"] is True


def test_user_changes_override_the_preset():
    spec = spec_from_request({"type": "box_truck", "height_ft": 11.5})
    assert spec.height_ft == 11.5
    assert spec.length_ft == PRESETS["box_truck"].length_ft


def test_missing_truck_means_dry_van():
    assert spec_from_request(None) == PRESETS["dry_van"]


def test_gross_over_80000_lb_is_flagged():
    info = PRESETS["reefer"].as_json(load_lb=45_000)
    assert info["gross_lb"] == 83_000
    assert info["over_federal_limit"] is (83_000 > FEDERAL_GROSS_LIMIT_LB)


def test_truck_options_reach_the_valhalla_request(monkeypatch):
    sent = {}

    def fake_post(url, body, **kw):
        sent.update(body)
        raise valhalla.UpstreamError("stop here")

    monkeypatch.setattr(valhalla, "post_json", fake_post)
    opts = PRESETS["box_truck"].costing_options(8_000)
    with pytest.raises(valhalla.UpstreamError):
        valhalla.truck_routes((36.0, -78.9), (36.1, -78.8), opts)
    assert sent["costing"] == "truck"
    assert sent["costing_options"]["truck"] == opts
    assert sent["alternates"] == 2


@pytest.mark.skipif(not LIVE, reason="calls the public Valhalla server; run with LIVE_TESTS=1")
def test_live_low_bridge_gregson_street_durham():
    """The 'can opener' bridge on S Gregson St is mapped maxheight=12'4"."""
    north, south = (35.99985, -78.90950), (35.99830, -78.91080)
    box = valhalla.truck_routes(north, south, PRESETS["box_truck"].costing_options(5_000), want=1)[0]
    van = valhalla.truck_routes(north, south, PRESETS["dry_van"].costing_options(30_000), want=1)[0]
    assert box.distance_mi < 0.3  # 12'0" fits under
    assert van.distance_mi > 1.0  # 13'6" goes around
