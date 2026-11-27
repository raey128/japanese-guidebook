"""The media store for review photos and avatars (R20.3, R21.2).

Every upload is decoded, turned upright, re-encoded as JPEG **without its metadata** (so the GPS
position and camera details inside a phone photo are never kept or served) and saved in two
sizes: a full one (longest side 1600 px) and a thumbnail (400 px). Avatars are cropped to a
centred square. Files are named by a random key; nothing about the user is in the name.

Storage is a folder (`settings.media_dir`) for the MVP. Everything goes through `save`, `delete`
and `url`, so a cloud bucket can replace the folder later without touching callers.
"""

import io
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.config import get_settings

if TYPE_CHECKING:
    from PIL import Image as PILImage

FULL_SIDE = 1600
THUMB_SIDE = 400
AVATAR_SIDE = 400
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "HEIC", "MPO"}
URL_PREFIX = "/api/media"
MAX_PIXELS = 50_000_000  # decompression-bomb guard; far above any phone photo


def _pil() -> Any:
    """Pillow, loaded on first use (with the HEIC decoder) so the app starts without it."""
    from PIL import Image

    if Image.MAX_IMAGE_PIXELS != MAX_PIXELS:
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        try:  # iPhone HEIC/HEIF photos
            from pillow_heif import register_heif_opener

            register_heif_opener()
        except ImportError:  # pragma: no cover - only without the optional decoder
            pass
    return Image


class PhotoError(ValueError):
    """The upload isn't a usable photo (wrong type, too big, unreadable)."""


@dataclass(frozen=True)
class Saved:
    key: str
    width: int
    height: int


def _root() -> Path:
    return get_settings().media_dir


def _encode(img: "PILImage.Image") -> bytes:
    out = io.BytesIO()
    # A fresh image with no info dict: no EXIF/GPS/XMP/ICC comes along.
    clean = _pil().new("RGB", img.size)
    clean.paste(img)
    clean.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue()


def _open(data: bytes) -> "PILImage.Image":
    from PIL import ImageOps, UnidentifiedImageError

    Image = _pil()
    if len(data) > get_settings().photo_max_bytes:
        raise PhotoError("Photos can be up to 12 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
        if fmt not in ALLOWED_FORMATS:
            raise PhotoError("Use a JPEG, PNG, WebP or iPhone (HEIC) photo.")
        img.load()
    except PhotoError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise PhotoError("That file isn't a photo we can read.") from e
    except (SyntaxError, ValueError) as e:  # e.g. Pillow's "broken PNG file"
        raise PhotoError("That file isn't a photo we can read.") from e
    img = ImageOps.exif_transpose(img)  # apply the camera's rotation before dropping EXIF
    return img.convert("RGB")


def save(data: bytes, kind: str, *, square: bool = False) -> Saved:
    """Clean, resize and store an upload. `kind` is a folder: "photos" or "avatars"."""
    from PIL import ImageOps

    Image = _pil()
    img = _open(data)
    if square:
        full = ImageOps.fit(img, (AVATAR_SIDE, AVATAR_SIDE), Image.Resampling.LANCZOS)
        thumb = ImageOps.fit(img, (THUMB_SIDE // 2, THUMB_SIDE // 2), Image.Resampling.LANCZOS)
    else:
        full = img.copy()
        full.thumbnail((FULL_SIDE, FULL_SIDE), Image.Resampling.LANCZOS)
        thumb = img.copy()
        thumb.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS)
    key = f"{kind}/{uuid.uuid4().hex}"
    folder = _root() / kind
    folder.mkdir(parents=True, exist_ok=True)
    (_root() / f"{key}.jpg").write_bytes(_encode(full))
    (_root() / f"{key}_t.jpg").write_bytes(_encode(thumb))
    return Saved(key=key, width=full.width, height=full.height)


def delete(key: str | None) -> None:
    """Remove both sizes; missing files are fine."""
    if not key:
        return
    for suffix in ("", "_t"):
        (_root() / f"{key}{suffix}.jpg").unlink(missing_ok=True)


def url(key: str | None, *, thumb: bool = False) -> str | None:
    if not key:
        return None
    return f"{URL_PREFIX}/{key}{'_t' if thumb else ''}.jpg"
