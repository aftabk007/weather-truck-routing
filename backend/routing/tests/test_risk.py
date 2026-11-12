import pytest

from routing.services.risk import Level, Weather, assess, rain_level, snow_level, wind_level, wind_level_for_load


@pytest.mark.parametrize(
    "mph, level",
    [(0, Level.LOW), (24.9, Level.LOW), (25, Level.MODERATE), (34.9, Level.MODERATE), (35, Level.HIGH),
     (44.9, Level.HIGH), (45, Level.SEVERE), (54.9, Level.SEVERE), (55, Level.NO_TRAVEL), (80, Level.NO_TRAVEL)],
)
def test_wind_bands(mph, level):
    assert wind_level(mph) == level


@pytest.mark.parametrize(
    "inches, level",
    [(0, Level.LOW), (0.099, Level.LOW), (0.10, Level.MODERATE), (0.25, Level.HIGH), (0.49, Level.HIGH),
     (0.50, Level.SEVERE), (1.00, Level.SEVERE), (1.01, Level.NO_TRAVEL)],
)
def test_rain_bands(inches, level):
    assert rain_level(inches) == level


@pytest.mark.parametrize(
    "inches, level",
    [(0.49, Level.LOW), (0.5, Level.MODERATE), (1.0, Level.HIGH), (2.0, Level.SEVERE), (3.0, Level.SEVERE),
     (3.01, Level.NO_TRAVEL)],
)
def test_snow_bands(inches, level):
    assert snow_level(inches) == level


def test_55_mph_is_no_travel_even_empty():
    assert wind_level_for_load(55, 0)[0] == Level.NO_TRAVEL


@pytest.mark.parametrize("load, level", [(30_000, Level.SEVERE), (30_001, Level.NO_TRAVEL)])
def test_45_to_54_mph_depends_on_30k_lb(load, level):
    assert wind_level_for_load(50, load)[0] == level


@pytest.mark.parametrize("load, level", [(40_000, Level.HIGH), (40_001, Level.SEVERE)])
def test_35_to_44_mph_depends_on_40k_lb(load, level):
    assert wind_level_for_load(40, load)[0] == level


def test_load_rule_does_not_touch_lower_wind():
    assert wind_level_for_load(30, 80_000)[0] == Level.MODERATE


def test_checkpoint_takes_the_worst_condition_and_says_why():
    a = assess(Weather(wind_mph=10, gust_mph=20, rain_in_hr=0.3, snow_in_hr=0.6), load_lb=20_000)
    assert a.level == Level.HIGH
    assert a.reasons == ["Rain 0.30 in/hr: High"]


def test_load_rule_reason_is_reported():
    a = assess(Weather(wind_mph=47, gust_mph=60, rain_in_hr=0, snow_in_hr=0), load_lb=35_000)
    assert a.level == Level.NO_TRAVEL
    assert "30,000 lb" in a.reasons[0]


def test_calm_weather_has_no_reasons():
    assert assess(Weather(5, 8, 0, 0), 10_000).reasons == []
