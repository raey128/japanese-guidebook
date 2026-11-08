"""Who can see a place (R13.2, R13.3).

Hidden places are invisible to everyone but admins, except that a *pending* manual add stays
visible to the user who submitted it. Pending places are stored with is_hidden = true, so all
public queries (lists, scores, dump, profiles) exclude them through their existing filters.
"""

from app.models import Place, User

# For raw SQL over `places p`; bind :viewer_id (None for signed-out viewers matches nothing).
VISIBLE_SQL = "(NOT p.is_hidden OR (p.status = 'pending' AND p.creator_id = :viewer_id))"


def is_own_pending(place: Place, user_id: int | None) -> bool:
    return place.status == "pending" and user_id is not None and place.creator_id == user_id


def can_see(place: Place, user: User | None) -> bool:
    """Visible to this viewer, ignoring merges (callers redirect merged places themselves)."""
    if not place.is_hidden:
        return True
    if user is not None and user.is_admin:
        return True
    return is_own_pending(place, user.id if user else None)


def can_use(place: Place, user_id: int | None) -> bool:
    """Can be ranked/bookmarked: live and unhidden, or the viewer's own pending place."""
    if place.merged_into_id is not None:
        return False
    return not place.is_hidden or is_own_pending(place, user_id)
