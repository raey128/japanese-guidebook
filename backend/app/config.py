"""Application settings. Every tunable named in SPEC.md is a config value here."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GUIDEBOOK_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://guidebook:guidebook@localhost:5432/guidebook"
    log_level: str = "INFO"

    # Identity
    session_days: int = 30
    session_cookie_name: str = "gb_session"
    cookie_secure: bool = False

    # Geography
    coverage_radius_km: float = 30.0

    # Geocoding (public Nominatim for the MVP; swap for a self-hosted instance later)
    geocoder_url: str = "https://nominatim.openstreetmap.org/reverse"
    # Forward search for "search an address to set the pin" (N3.3); same throttle and cache rules.
    geocoder_search_url: str = "https://nominatim.openstreetmap.org/search"
    geocoder_user_agent: str = "JapaneseGuidebook/0.1 (https://github.com/japanese-guidebook)"
    geocoder_min_interval_s: float = 1.0
    geocoder_timeout_s: float = 1.5
    # Business-name type-ahead for adding places (Photon: OSM search built for autocomplete;
    # Nominatim's policy forbids autocomplete use).
    place_lookup_url: str = "https://photon.komoot.io/api/"
    place_lookup_timeout_s: float = 2.5

    # Places
    edit_window_hours: int = 24
    new_account_days: int = 7
    new_account_daily_places: int = 5
    established_daily_places: int = 20
    duplicate_same_subcategory_m: float = 50.0
    duplicate_name_m: float = 200.0
    duplicate_name_similarity: float = 0.3
    seed_duplicate_m: float = 50.0

    # Scores
    prior_weight: float = 5.0
    default_prior: float = 5.0

    # Map
    cluster_max_zoom: int = 11
    map_point_cap: int = 2000

    # Moderation
    flag_threshold: int = 3

    # Paths
    data_dir: Path = REPO_ROOT / "data"
    dump_dir: Path = REPO_ROOT / "dumps"
    # Uploaded review photos (R20.3). A local folder for the MVP; behind app/media.py so a
    # cloud bucket can replace it later.
    media_dir: Path = REPO_ROOT / "media"
    photo_max_bytes: int = 12 * 1024 * 1024
    photos_per_review: int = 4
    photo_reports_to_hide: int = 3
    # Ratings below this need a comment (R3.6). 0 = comments are always optional (decided
    # 2026-11-27: "no comment is required for now"); set 5 to require one at 4 or lower.
    comment_required_below: int = 0
    # Public address of the site, for the links the organizer shares (V1).
    site_url: str = "http://localhost:5173"
    # Vote rate limits (V1.4): writes per minute per link and per voter.
    vote_writes_per_list_per_minute: int = 300
    vote_writes_per_voter_per_minute: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
