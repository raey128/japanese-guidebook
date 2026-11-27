"""Photos of places from Wikimedia Commons (decided 2026-11-27).

For a place we look for a Wikipedia article (English, then Japanese) within a few hundred metres
whose title matches the place's name, take that article's main image, and keep it only if it
is freely licensed (CC BY / CC BY-SA / CC0 / public domain). We store links, not files: images
are shown from upload.wikimedia.org with the author and licence as the credit line.

Good for sights (temples, towers, parks); restaurants rarely have articles, and keep their
poster art or users' photos. Polite to the API: one request at a time, a descriptive
User-Agent (no personal contact details), and every failure just means "no photo".
"""

import asyncio
import html
import logging
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

import httpx

log = logging.getLogger(__name__)

USER_AGENT = "JapaneseGuidebook/0.1 (https://github.com/raey128/japanese-guidebook)"
RADIUS_M = 300
FULL_WIDTH = 960
THUMB_WIDTH = 400
MATCH = 0.86  # name similarity needed to accept an article
FREE = re.compile(r"^(cc[ -]?by|cc0|public domain|pd\b)", re.I)


@dataclass(frozen=True)
class WikiImage:
    image_url: str
    thumb_url: str
    page_url: str  # the file's Commons page (credit link)
    article_url: str
    author: str
    license: str


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"\(.*?\)", " ", s)  # "Senso-ji (Asakusa)" -> "Senso-ji"
    s = re.sub(r"[\s\-_'’.,・]+", "", s)
    # Generic words that don't change which place it is ("station" does: a neighbourhood and its
    # station are different places).
    for suffix in ("temple", "shrine", "tokyo"):
        s = s.removesuffix(suffix)
    return s


def similar(a: str, b: str) -> float:
    na, nb = _norm(a), _norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    short, long_ = sorted((na, nb), key=len)
    # "Senso-ji" vs "Sensoji Temple": one inside the other only counts when they're nearly the
    # same length ("Shibuya" inside "Shibuya Sky" is a different place).
    if len(short) >= 4 and short in long_ and len(short) / len(long_) >= 0.8:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def _strip_html(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


async def _get(http: httpx.AsyncClient, url: str, params: dict[str, Any]) -> dict[str, Any] | None:
    try:
        r = await http.get(url, params={"format": "json", "formatversion": 2, **params})
        if r.status_code != 200:
            return None
        data = r.json()
        return data if isinstance(data, dict) else None
    except Exception as e:  # network, JSON: just "no photo"
        log.warning("wikimedia request failed: %s", type(e).__name__)
        return None


async def _article(
    http: httpx.AsyncClient, lang: str, name: str, lat: float, lng: float
) -> str | None:
    """Title of the nearby article that best matches `name`, if any is close enough."""
    data = await _get(
        http,
        f"https://{lang}.wikipedia.org/w/api.php",
        {
            "action": "query",
            "list": "geosearch",
            "gscoord": f"{lat}|{lng}",
            "gsradius": RADIUS_M,
            "gslimit": 20,
        },
    )
    hits = (data or {}).get("query", {}).get("geosearch", [])
    best = max(hits, key=lambda h: similar(name, h.get("title", "")), default=None)
    if best is None or similar(name, best.get("title", "")) < MATCH:
        return None
    return str(best["title"])


async def _image_of(http: httpx.AsyncClient, lang: str, title: str) -> WikiImage | None:
    data = await _get(
        http,
        f"https://{lang}.wikipedia.org/w/api.php",
        {"action": "query", "prop": "pageimages", "piprop": "name", "titles": title},
    )
    pages = (data or {}).get("query", {}).get("pages", [])
    file = pages[0].get("pageimage") if pages else None
    if not file:
        return None
    info = await _get(
        http,
        "https://commons.wikimedia.org/w/api.php",
        {
            "action": "query",
            "titles": f"File:{file}",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": FULL_WIDTH,
        },
    )
    ipages = (info or {}).get("query", {}).get("pages", [])
    ii = (ipages[0].get("imageinfo") or [None])[0] if ipages else None
    if not ii or not ii.get("thumburl"):
        return None  # not on Commons (local, often non-free) or no thumbnail
    meta = ii.get("extmetadata") or {}
    license_ = _strip_html(meta.get("LicenseShortName", {}).get("value", ""))
    if meta.get("NonFree", {}).get("value") or not FREE.match(license_):
        return None
    author = _strip_html(meta.get("Artist", {}).get("value", "")) or "Wikimedia Commons"
    full = ii["thumburl"]
    thumb = re.sub(rf"/{FULL_WIDTH}px-", f"/{THUMB_WIDTH}px-", full)
    return WikiImage(
        image_url=full,
        thumb_url=thumb,
        page_url=ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{file}",
        article_url=f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}",
        author=author[:300],
        license=license_[:80],
    )


async def find_image(
    name: str, name_ja: str | None, lat: float, lng: float, *, http: httpx.AsyncClient | None = None
) -> WikiImage | None:
    """The photo for one place, or None. Never raises."""
    own = http is None
    client = http or httpx.AsyncClient(timeout=10, headers={"User-Agent": USER_AGENT})
    try:
        # Japanese first: Japanese titles match place names more exactly (明治神宮 = Meiji Jingu).
        for lang, n in (("ja", name_ja), ("en", name)):
            if not n:
                continue
            title = await _article(client, lang, n, lat, lng)
            if title:
                img = await _image_of(client, lang, title)
                if img:
                    return img
            await asyncio.sleep(0.1)
        return None
    except Exception:
        log.exception("wikimedia lookup failed")
        return None
    finally:
        if own:
            await client.aclose()
