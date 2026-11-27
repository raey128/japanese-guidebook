"""Review photos (R20)."""

from app.schemas.common import Out, PhotoOut


class PlacePhotos(Out):
    photos: list[PhotoOut]


class ReportResult(Out):
    hidden: bool  # True once enough people reported it (or an admin hid it)


class AdminPhoto(PhotoOut):
    place_id: int
    place_name: str
    report_count: int
    is_hidden: bool
