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
import time
from collections import OrderedDict
from dataclasses import dataclass
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
                "OR clock_timestamp() - last_called_at"
                " >= make_interval(secs => CAST(:i AS float8)))"
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
    await db.execute(
        text("UPDATE geocode_throttle SET last_called_at = clock_timestamp() WHERE id = 1")
    )
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


# --- Business lookup for the add-place type-ahead (R13.11) ------------------------------------

# Roughly Japan, so a search for "Ichiran" doesn't return branches abroad.
JAPAN_BBOX = "122.9,24.0,154.0,45.6"
# Skip roads, admin areas and land use: we want businesses and sights.
EXCLUDED_OSM_KEYS = ("highway", "place", "boundary", "landuse", "railway", "natural")
LOOKUP_LIMIT = 8
_CACHE_MAX = 500
_CACHE_TTL_S = 24 * 3600

# Name words that pin down the subcategory where the OSM tag alone can't
# (a "restaurant" could be anything). Checked in order; first match wins.
NAME_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ramen", ("ramen", "ラーメン", "らーめん", "拉麺", "中華そば", "つけ麺")),
    ("sushi", ("sushi", "寿司", "鮨", "すし")),
    ("yakitori", ("yakitori", "焼鳥", "焼き鳥", "やきとり")),
    ("izakaya", ("izakaya", "居酒屋")),
    ("tempura", ("tempura", "天ぷら", "天麩羅")),
    ("tonkatsu", ("tonkatsu", "とんかつ", "豚カツ", "katsu")),
    ("okonomiyaki", ("okonomiyaki", "お好み焼", "monja", "もんじゃ")),
    ("udon_soba", ("udon", "soba", "うどん", "そば", "蕎麦")),
    ("kaiseki", ("kaiseki", "懐石", "会席", "料亭")),
    ("shrine", ("shrine", "jinja", "神社", "神宮", "大社", "宮")),
    ("temple", ("temple", "寺", "-ji", "院")),
    ("onsen", ("onsen", "sento", "温泉", "銭湯", "湯")),
)

# (osm_key, osm_value) -> slug; ("key", "*") matches any value.
TAG_SLUGS: dict[tuple[str, str], str] = {
    ("amenity", "cafe"): "cafe",
    ("amenity", "bar"): "bar",
    ("amenity", "pub"): "bar",
    ("amenity", "biergarten"): "bar",
    ("amenity", "nightclub"): "bar",
    ("amenity", "ice_cream"): "sweets",
    ("amenity", "marketplace"): "market",
    ("amenity", "public_bath"): "onsen",
    ("shop", "bakery"): "sweets",
    ("shop", "confectionery"): "sweets",
    ("shop", "pastry"): "sweets",
    ("shop", "*"): "shopping",
    ("tourism", "hotel"): "hotel",
    ("tourism", "motel"): "hotel",
    ("tourism", "hostel"): "hostel",
    ("tourism", "museum"): "museum",
    ("tourism", "gallery"): "museum",
    ("tourism", "viewpoint"): "viewpoint",
    ("tourism", "attraction"): "landmark",
    ("tourism", "theme_park"): "activity",
    ("tourism", "zoo"): "activity",
    ("tourism", "aquarium"): "activity",
    ("historic", "castle"): "castle",
    ("historic", "*"): "landmark",
    ("leisure", "park"): "garden_park",
    ("leisure", "garden"): "garden_park",
    ("leisure", "*"): "activity",
}
# Tags where the name decides (a "restaurant" could serve anything).
NAME_DECIDES = {
    ("amenity", "restaurant"),
    ("amenity", "fast_food"),
    ("amenity", "food_court"),
    ("amenity", "place_of_worship"),
}


@dataclass(frozen=True)
class LookupResult:
    name: str
    address: str | None
    lat: float
    lng: float
    kind: str | None
    slug: str | None


def guess_slug(osm_key: str | None, osm_value: str | None, name: str) -> str | None:
    """Best-guess subcategory slug for an OSM feature, or None to let the user choose."""
    key, value = osm_key or "", osm_value or ""
    lowered = name.lower()
    by_name = next((slug for slug, words in NAME_HINTS if any(w in lowered for w in words)), None)
    if (key, value) == ("tourism", "guest_house"):
        return "ryokan" if "ryokan" in lowered or "旅館" in name else "hostel"
    if (key, value) in NAME_DECIDES:
        if key == "amenity" and value == "place_of_worship":
            return by_name if by_name in ("shrine", "temple") else None
        return by_name if by_name not in ("shrine", "temple", "onsen") else None
    return TAG_SLUGS.get((key, value)) or TAG_SLUGS.get((key, "*")) or by_name


def _address(props: dict[str, Any]) -> str | None:
    street = " ".join(str(props[k]) for k in ("housenumber", "street") if props.get(k))
    parts = [street, props.get("locality"), props.get("district"), props.get("city")]
    parts += [props.get("postcode")]
    seen: list[str] = []
    for part in parts:
        if part and str(part) not in seen:
            seen.append(str(part))
    return ", ".join(seen) or None


def parse_photon(data: Any) -> list[LookupResult]:
    """Named features in Japan from a Photon GeoJSON response; anything malformed is skipped."""
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        return []
    out: list[LookupResult] = []
    for feature in data["features"]:
        try:
            props = feature["properties"]
            name = str(props.get("name") or "").strip()
            if not name or (props.get("countrycode") or "JP").upper() != "JP":
                continue
            if props.get("osm_key") in EXCLUDED_OSM_KEYS:
                continue
            lng, lat = (float(c) for c in feature["geometry"]["coordinates"][:2])
            key, value = props.get("osm_key"), props.get("osm_value")
            out.append(
                LookupResult(
                    name=name[:200],
                    address=_address(props),
                    lat=lat,
                    lng=lng,
                    kind=f"{key}={value}" if key and value else None,
                    slug=guess_slug(key, value, name),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


_lookup_cache: OrderedDict[tuple[str, float | None, float | None], tuple[float, list]] = (
    OrderedDict()
)


async def lookup_places(q: str, lat: float | None, lng: float | None) -> list[LookupResult]:
    """Search businesses by name. Cached in-process for a day (keyed on the query and the bias
    point rounded to ~1 km). Never raises: failures give []."""
    q = q.strip()
    if len(q) < 2:
        return []
    bias = (round(lat, 2), round(lng, 2)) if lat is not None and lng is not None else (None, None)
    key = (q.lower(), *bias)
    now = time.monotonic()
    hit = _lookup_cache.get(key)
    if hit and now - hit[0] < _CACHE_TTL_S:
        _lookup_cache.move_to_end(key)
        return hit[1]
    s = get_settings()
    params: list[tuple[str, str | int | float | bool | None]] = [
        ("q", q),
        ("limit", LOOKUP_LIMIT),
        ("lang", "en"),
        ("bbox", JAPAN_BBOX),
    ]
    params += [("osm_tag", f"!{k}") for k in EXCLUDED_OSM_KEYS]
    if bias[0] is not None:
        # Low scale = nearness matters more than fame, so the branch nearby comes first.
        params += [("lat", bias[0]), ("lon", bias[1]), ("zoom", 14), ("location_bias_scale", 0.1)]
    try:
        async with httpx.AsyncClient(
            timeout=s.place_lookup_timeout_s, headers={"User-Agent": s.geocoder_user_agent}
        ) as http:
            r = await http.get(s.place_lookup_url, params=params)
        if r.status_code != 200:
            log.warning("place lookup returned %s", r.status_code)
            return []
        results = parse_photon(r.json())
        if bias[0] is not None:
            # Nearest first: with a name like "Ichiran" you want the branch you're near.
            results.sort(key=lambda x: (x.lat - bias[0]) ** 2 + (x.lng - bias[1]) ** 2)
    except Exception as e:  # timeouts, connection errors, bad JSON ...
        log.warning("place lookup failed: %s", type(e).__name__)
        return []
    _lookup_cache[key] = (now, results)
    while len(_lookup_cache) > _CACHE_MAX:
        _lookup_cache.popitem(last=False)
    return results


# --- Area lookup for the map search bar (R12.7): "Shimbashi" flies the map there -----------

AREA_PLACE_VALUES = {
    "city",
    "town",
    "village",
    "borough",
    "suburb",
    "quarter",
    "neighbourhood",
    "locality",
    "hamlet",
    "city_block",
}
AREA_ZOOM = {"city": 12, "town": 13, "borough": 13, "suburb": 14, "village": 14}
STATION_ZOOM = 16
DEFAULT_AREA_ZOOM = 15


@dataclass(frozen=True)
class AreaResult:
    name: str
    detail: str | None  # "Minato, Tokyo"
    kind: str  # "area" | "station"
    lat: float
    lng: float
    zoom: int


def parse_photon_areas(data: Any) -> list[AreaResult]:
    """Neighbourhoods, districts and stations in Japan; anything else is skipped."""
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        return []
    out: list[AreaResult] = []
    seen: set[tuple[str, str]] = set()
    for feature in data["features"]:
        try:
            props = feature["properties"]
            name = str(props.get("name") or "").strip()
            if not name or (props.get("countrycode") or "JP").upper() != "JP":
                continue
            key, value = props.get("osm_key"), props.get("osm_value")
            if key == "place" and value in AREA_PLACE_VALUES:
                kind, zoom = "area", AREA_ZOOM.get(value, DEFAULT_AREA_ZOOM)
            elif value == "station" and key in ("railway", "public_transport"):
                kind, zoom = "station", STATION_ZOOM
            else:
                continue
            lng, lat = (float(c) for c in feature["geometry"]["coordinates"][:2])
            parts = [props.get(k) for k in ("district", "city", "state")]
            detail = ", ".join(dict.fromkeys(str(p) for p in parts if p and str(p) != name)) or None
            dedupe = (name.lower(), kind)
            if dedupe in seen:  # a station often appears once per operator
                continue
            seen.add(dedupe)
            out.append(AreaResult(name[:120], detail, kind, lat, lng, zoom))
        except (KeyError, TypeError, ValueError):
            continue
    return out


_area_cache: OrderedDict[tuple[str, float | None, float | None], tuple[float, list]] = OrderedDict()


async def lookup_areas(q: str, lat: float | None, lng: float | None) -> list[AreaResult]:
    """Search areas and stations by name, nearest first when a point is given. Cached in-process
    for a day; never raises (failures give [])."""
    q = q.strip()
    if len(q) < 2:
        return []
    bias = (round(lat, 2), round(lng, 2)) if lat is not None and lng is not None else (None, None)
    key = (q.lower(), *bias)
    now = time.monotonic()
    hit = _area_cache.get(key)
    if hit and now - hit[0] < _CACHE_TTL_S:
        _area_cache.move_to_end(key)
        return hit[1]
    s = get_settings()
    params: list[tuple[str, str | int | float | bool | None]] = [
        ("q", q),
        ("limit", 10),
        ("lang", "en"),
        ("bbox", JAPAN_BBOX),
        ("osm_tag", "place"),
        ("osm_tag", "railway:station"),
        ("osm_tag", "public_transport:station"),
    ]
    if bias[0] is not None:
        params += [("lat", bias[0]), ("lon", bias[1]), ("zoom", 12), ("location_bias_scale", 0.2)]
    try:
        async with httpx.AsyncClient(
            timeout=s.place_lookup_timeout_s, headers={"User-Agent": s.geocoder_user_agent}
        ) as http:
            r = await http.get(s.place_lookup_url, params=params)
        if r.status_code != 200:
            log.warning("area lookup returned %s", r.status_code)
            return []
        results = parse_photon_areas(r.json())[:5]
    except Exception as e:
        log.warning("area lookup failed: %s", type(e).__name__)
        return []
    _area_cache[key] = (now, results)
    while len(_area_cache) > _CACHE_MAX:
        _area_cache.popitem(last=False)
    return results
