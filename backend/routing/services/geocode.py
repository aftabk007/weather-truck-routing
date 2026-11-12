"""Place search for the origin and destination boxes (Photon, OpenStreetMap data)."""

from __future__ import annotations

from django.conf import settings

from .http import get_json

US_CENTER = (39.5, -98.35)
TRUCKING_COUNTRIES = {"US", "CA", "MX"}


def search(query: str, limit: int = 6) -> list[dict]:
    data = get_json(
        f"{settings.PHOTON_URL}/api/",
        {"q": query, "limit": limit * 2, "lang": "en", "lat": US_CENTER[0], "lon": US_CENTER[1]},
        ttl=24 * 3600,
        name="Geocoding (Photon)",
    )
    out, seen = [], set()
    for f in data.get("features", []):
        p = f.get("properties", {})
        if p.get("countrycode") not in TRUCKING_COUNTRIES:
            continue  # the road network we route on is North American
        lon, lat = f["geometry"]["coordinates"]
        parts = [p.get("name"), p.get("city") if p.get("city") != p.get("name") else None, p.get("state"), p.get("countrycode")]
        label = ", ".join(x for x in parts if x) or query
        if label in seen:
            continue  # e.g. a city and its county share a name
        seen.add(label)
        out.append({"label": label, "lat": lat, "lon": lon})
    return out[:limit]
