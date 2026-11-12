from routing.services import geocode
from routing.services.http import UpstreamError

PHOTON = {
    "features": [
        {"properties": {"name": "Sacramento", "state": "California", "countrycode": "US"}, "geometry": {"coordinates": [-121.49, 38.58]}},
        {"properties": {"name": "Sacramento", "state": "California", "countrycode": "US"}, "geometry": {"coordinates": [-121.3, 38.4]}},
        {"properties": {"name": "Sacramento", "state": "Minas Gerais", "countrycode": "BR"}, "geometry": {"coordinates": [-47.4, -19.8]}},
    ]
}
OPEN_METEO = {
    "results": [
        {"name": "Reno", "admin1": "Nevada", "country_code": "US", "latitude": 39.53, "longitude": -119.81},
        {"name": "Reno", "admin1": "Emilia-Romagna", "country_code": "IT", "latitude": 44.6, "longitude": 10.6},
    ]
}


def test_photon_results_are_north_american_and_unique(monkeypatch):
    monkeypatch.setattr(geocode, "get_json", lambda url, params, **kw: PHOTON)
    assert geocode.search("Sacramento") == [{"label": "Sacramento, California, US", "lat": 38.58, "lon": -121.49}]


def test_slow_or_failing_photon_falls_back_to_open_meteo(monkeypatch):
    calls = []

    def fake(url, params, **kw):
        calls.append((url, kw.get("timeout")))
        if "photon" in url:
            raise UpstreamError("Geocoding (Photon) did not answer (ReadTimeout)")
        return OPEN_METEO

    monkeypatch.setattr(geocode, "get_json", fake)
    assert geocode.search("Reno") == [{"label": "Reno, Nevada, US", "lat": 39.53, "lon": -119.81}]
    assert calls[0][1] == geocode.PHOTON_TIMEOUT_S  # Photon only gets a short wait
    assert calls[1][0] == geocode.OPEN_METEO_GEOCODE_URL
