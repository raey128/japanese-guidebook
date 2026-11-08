"""Geocoding behind a configurable URL (public Nominatim for the MVP).

* Reverse results are cached in Postgres by coordinates rounded to 4 decimals. Only successful
  lookups are cached; failures are not (they are usually transient).
* Outgoing calls are limited to one per `geocoder_min_interval_s` across all workers: a
  transaction-scoped advisory lock plus the single `geocode_throttle` row. When the lock is
  busy or the interval has not passed, the caller gets "no address" instead of waiting.
* Nothing here ever raises into the caller: any failure yields None / [].

The throttle row and cache insert are written on the caller's session; the caller commits
(which also releases the advisory lock).
"""

import logging
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

log = logging.getLogger(__name__)

THROTTLE_LOCK_KEY = 7_204_001  # arbitrary fixed app-wide advisory lock key


def cache_key(lat: float, lng: float) -> tuple[int, int]:
    return round(lat * 10_000), round(lng * 10_000)


async def cached_address(db: AsyncSession, lat: float, lng: float) -> str | None:
    """Cache-only lookup (never calls out)."""
    lat_e4, lng_e4 = cache_key(lat, lng)
    row = (
        await db.execute(
            text("SELECT address FROM geocode_cache WHERE lat_e4 = :a AND lng_e4 = :b"),
            {"a": lat_e4, "b": lng_e4},
        )
    ).first()
    return row.address if row else None


async def _take_throttle(db: AsyncSession) -> bool:
    """True if we may make one outgoing call now (and records it)."""
    got = (
        await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": THROTTLE_LOCK_KEY})
    ).scalar_one()
    if not got:
        return False
    interval = get_settings().geocoder_min_interval_s
    row = (
        await db.execute(
            text(
                "SELECT (last_called_at IS NULL "
                "OR clock_timestamp() - last_called_at >= make_interval(secs => CAST(:i AS float8)))"
                " AS ok FROM geocode_throttle WHERE id = 1"
            ),
            {"i": interval},
        )
    ).first()
    if row is None:  # row missing: create it and allow
        await db.execute(
            text("INSERT INTO geocode_throttle (id, last_called_at) VALUES (1, clock_timestamp())")
        )
        return True
    if not row.ok:
        return False
    await db.execute(text("UPDATE geocode_throttle SET last_called_at = clock_timestamp() WHERE id = 1"))
    return True


async def _get_json(url: str, params: dict[str, Any]) -> Any | None:
    s = get_settings()
    try:
        async with httpx.AsyncClient(
            timeout=s.geocoder_timeout_s, headers={"User-Agent": s.geocoder_user_agent}
        ) as http:
            r = await http.get(url, params=params)
        if r.status_code != 200:
            log.warning("geocoder returned %s", r.status_code)
            return None
        return r.json()
    except Exception as e:  # timeouts, connection errors, bad JSON ...
        log.warning("geocoder call failed: %s", type(e).__name__)
        return None


async def reverse_geocode(db: AsyncSession, lat: float, lng: float) -> str | None:
    try:
        cached = await cached_address(db, lat, lng)
        if cached is not None:
            return cached
        if not await _take_throttle(db):
            return None
        data = await _get_json(
            get_settings().geocoder_url,
            {"format": "jsonv2", "lat": lat, "lon": lng, "accept-language": "en"},
        )
        address = data.get("display_name") if isinstance(data, dict) else None
        if not isinstance(address, str) or not address.strip():
            return None
        address = address.strip()
        lat_e4, lng_e4 = cache_key(lat, lng)
        await db.execute(
            text(
                "INSERT INTO geocode_cache (lat_e4, lng_e4, address) VALUES (:a, :b, :addr) "
                "ON CONFLICT (lat_e4, lng_e4) DO UPDATE SET address = EXCLUDED.address"
            ),
            {"a": lat_e4, "b": lng_e4, "addr": address},
        )
        return address
    except Exception:
        log.exception("reverse geocode failed")
        return None


async def search_address(db: AsyncSession, q: str) -> list[dict[str, Any]]:
    """Forward search for "search an address to set the pin". Not cached; same throttle."""
    try:
        if not q.strip() or not await _take_throttle(db):
            return []
        data = await _get_json(
            get_settings().geocoder_search_url,
            {"format": "jsonv2", "q": q.strip(), "limit": 5, "accept-language": "en"},
        )
        if not isinstance(data, list):
            return []
        results: list[dict[str, Any]] = []
        for item in data:
            try:
                results.append(
                    {
                        "label": str(item["display_name"]),
                        "lat": float(item["lat"]),
                        "lng": float(item["lon"]),
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue
        return results
    except Exception:
        log.exception("address search failed")
        return []
