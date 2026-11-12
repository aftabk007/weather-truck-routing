"""One HTTP client for all upstream APIs, with caching and clear errors."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx
from django.conf import settings
from django.core.cache import cache


class UpstreamError(Exception):
    """An upstream API (routing, geocoding, weather) failed or answered badly."""


_client: httpx.Client | None = None


def client() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(
            timeout=httpx.Timeout(25.0, connect=8.0),
            headers={"User-Agent": settings.HTTP_USER_AGENT},
            follow_redirects=True,
        )
    return _client


def _key(prefix: str, *parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return f"{prefix}:{hashlib.sha1(raw.encode()).hexdigest()}"


def get_json(url: str, params: dict | None = None, *, ttl: int = 600, name: str = "upstream") -> Any:
    key = _key("get", url, params)
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        resp = client().get(url, params=params)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{name} did not answer ({exc.__class__.__name__})") from exc
    if resp.status_code != 200:
        raise UpstreamError(f"{name} returned HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    cache.set(key, data, ttl)
    return data


def post_json(url: str, body: dict, *, ttl: int = 600, name: str = "upstream") -> Any:
    key = _key("post", url, body)
    hit = cache.get(key)
    if hit is not None:
        return hit
    try:
        resp = client().post(url, json=body)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{name} did not answer ({exc.__class__.__name__})") from exc
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else None
    if resp.status_code != 200:
        msg = (data or {}).get("error") if isinstance(data, dict) else None
        raise UpstreamError(f"{name} returned HTTP {resp.status_code}: {msg or resp.text[:200]}")
    cache.set(key, data, ttl)
    return data
