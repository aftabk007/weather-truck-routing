"""Weather risk rules from the assessment brief.

Levels are ordered numbers so they can be compared and averaged:
0 Low, 1 Moderate, 2 High, 3 Severe, 4 No Travel.

Boundaries: the brief's ranges touch (e.g. rain "0.10–0.25" and "0.25–0.50"),
so every range includes its lower bound: 0.25 in/hr is High, 35 mph is High.
The top bands are written with ">" in the brief (rain ">1.00", snow ">3.0"),
so exactly 1.00 in/hr rain or 3.0 in/hr snow is still Severe, while wind uses
"≥55", so exactly 55 mph is No Travel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum


class Level(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return ["Low", "Moderate", "High", "Severe", "No Travel"][self]


def wind_level(mph: float) -> Level:
    if mph >= 55:
        return Level.NO_TRAVEL
    if mph >= 45:
        return Level.SEVERE
    if mph >= 35:
        return Level.HIGH
    if mph >= 25:
        return Level.MODERATE
    return Level.LOW


def rain_level(in_per_hr: float) -> Level:
    if in_per_hr > 1.00:
        return Level.NO_TRAVEL
    if in_per_hr >= 0.50:
        return Level.SEVERE
    if in_per_hr >= 0.25:
        return Level.HIGH
    if in_per_hr >= 0.10:
        return Level.MODERATE
    return Level.LOW


def snow_level(in_per_hr: float) -> Level:
    if in_per_hr > 3.0:
        return Level.NO_TRAVEL
    if in_per_hr >= 2.0:
        return Level.SEVERE
    if in_per_hr >= 1.0:
        return Level.HIGH
    if in_per_hr >= 0.5:
        return Level.MODERATE
    return Level.LOW


def wind_level_for_load(mph: float, load_lb: float) -> tuple[Level, str | None]:
    """Wind level after the load rules. Returns the level and the rule that fired."""
    base = wind_level(mph)
    if mph >= 55:
        return Level.NO_TRAVEL, "Wind ≥55 mph: No Travel for any load"
    if 45 <= mph < 55 and load_lb > 30_000:
        return Level.NO_TRAVEL, "Wind 45–54 mph with load >30,000 lb: No Travel"
    if 35 <= mph < 45 and load_lb > 40_000:
        return max(base, Level.SEVERE), "Wind 35–44 mph with load >40,000 lb: Severe"
    return base, None


@dataclass(frozen=True)
class Weather:
    wind_mph: float
    gust_mph: float
    rain_in_hr: float
    snow_in_hr: float
    code: int | None = None


@dataclass(frozen=True)
class Assessment:
    level: Level
    wind: Level
    rain: Level
    snow: Level
    reasons: list[str] = field(default_factory=list)


def assess(w: Weather, load_lb: float) -> Assessment:
    """Checkpoint risk = the worst of wind (with load rules), rain and snow."""
    wind, rule = wind_level_for_load(w.wind_mph, load_lb)
    rain = rain_level(w.rain_in_hr)
    snow = snow_level(w.snow_in_hr)
    level = max(wind, rain, snow)
    reasons: list[str] = []
    if wind == level and level > Level.LOW:
        reasons.append(rule or f"Wind {w.wind_mph:.0f} mph: {wind.label}")
    if rain == level and level > Level.LOW:
        reasons.append(f"Rain {w.rain_in_hr:.2f} in/hr: {rain.label}")
    if snow == level and level > Level.LOW:
        reasons.append(f"Snow {w.snow_in_hr:.1f} in/hr: {snow.label}")
    return Assessment(level=level, wind=wind, rain=rain, snow=snow, reasons=reasons)
