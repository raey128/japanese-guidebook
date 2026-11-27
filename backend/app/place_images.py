"""Fill `place_images` with Wikimedia photos (see app/wikimedia.py)."""

import asyncio

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import wikimedia

RECHECK_DAYS = 90  # places with no photo are looked up again after this long


async def fetch(db: AsyncSession, *, limit: int = 500, refresh: bool = False) -> tuple[int, int]:
    """Look up places never checked (or checked long ago without a photo). Returns
    (checked, found). Commits as it goes so a long run keeps its progress."""
    where = (
        "TRUE"
        if refresh
        else (
            "(pi.place_id IS NULL OR (pi.image_url IS NULL"
            f" AND pi.checked_at < now() - interval '{RECHECK_DAYS} days'))"
        )
    )
    rows = (
        await db.execute(
            text(
                f"""
                SELECT p.id, p.name, p.name_ja, ST_Y(p.geom) AS lat, ST_X(p.geom) AS lng
                FROM places p LEFT JOIN place_images pi ON pi.place_id = p.id
                WHERE NOT p.is_hidden AND p.merged_into_id IS NULL AND {where}
                ORDER BY p.id LIMIT :limit
                """
            ),
            {"limit": limit},
        )
    ).all()
    found = 0
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": wikimedia.USER_AGENT}) as http:
        for r in rows:
            img = await wikimedia.find_image(r.name, r.name_ja, r.lat, r.lng, http=http)
            await db.execute(
                text(
                    """
                    INSERT INTO place_images (place_id, image_url, thumb_url, page_url, article_url,
                                              author, license, checked_at)
                    VALUES (:p, :u, :t, :pg, :a, :au, :l, now())
                    ON CONFLICT (place_id) DO UPDATE SET
                        image_url = EXCLUDED.image_url, thumb_url = EXCLUDED.thumb_url,
                        page_url = EXCLUDED.page_url, article_url = EXCLUDED.article_url,
                        author = EXCLUDED.author, license = EXCLUDED.license,
                        checked_at = now()
                    """
                ),
                {
                    "p": r.id,
                    "u": img.image_url if img else None,
                    "t": img.thumb_url if img else None,
                    "pg": img.page_url if img else None,
                    "a": img.article_url if img else None,
                    "au": img.author if img else None,
                    "l": img.license if img else None,
                },
            )
            await db.commit()
            found += img is not None
            await asyncio.sleep(0.2)
    return len(rows), found
