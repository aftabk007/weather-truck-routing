"""Place search for the origin and destination boxes.

Photon (OpenStreetMap data) is the main source: it finds addresses as well as
cities. It is a free public server and is sometimes very slow, so it gets a
short timeout; if it fails, Open-Meteo's geocoder (cities and towns, also free
and keyless) answers instead, so the boxes keep working.
"""

from __future__ import annotations

from django.conf import settings

from .http import UpstreamError, get_json

US_CENTER = (39.5, -98.35)
TRUCKING_COUNTRIES = {"US", "CA", "MX"}
PHOTON_TIMEOUT_S = 2.5
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"


def search(query: str, limit: int = 6) -> list[dict]:
    try:
        return _photon(query, limit)
    except UpstreamError:
        return _open_meteo(query, limit)


def _photon(query: str, limit: int) -> list[dict]:
    data = get_json(
        f"{settings.PHOTON_URL}/api/",
        {"q": query, "limit": limit * 2, "lang": "en", "lat": US_CENTER[0], "lon": US_CENTER[1]},
        ttl=24 * 3600,
        name="Geocoding (Photon)",
        timeout=PHOTON_TIMEOUT_S,
    )
    places = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        lon, lat = f["geometry"]["coordinates"]
        city = p.get("city") if p.get("city") != p.get("name") else None
        places.append((p.get("countrycode"), [p.get("name"), city, p.get("state")], lat, lon))
    return _labelled(places, query, limit)


def _open_meteo(query: str, limit: int) -> list[dict]:
    data = get_json(
        OPEN_METEO_GEOCODE_URL,
        {"name": query, "count": limit * 2, "language": "en", "format": "json"},
        ttl=24 * 3600,
        name="Geocoding (Open-Meteo)",
    )
    places = [(r.get("country_code"), [r.get("name"), r.get("admin1")], r["latitude"], r["longitude"]) for r in data.get("results") or []]
    return _labelled(places, query, limit)


def _labelled(places: list[tuple], query: str, limit: int) -> list[dict]:
    """(country, name parts, lat, lon) -> unique 'Name, State, CC' labels in North America."""
    out, seen = [], set()
    for country, parts, lat, lon in places:
        if country not in TRUCKING_COUNTRIES:
            continue  # the road network we route on is North American
        label = ", ".join(x for x in [*parts, country] if x) or query
        if label in seen:
            continue  # e.g. a city and its county share a name
        seen.add(label)
        out.append({"label": label, "lat": lat, "lon": lon})
    return out[:limit]
