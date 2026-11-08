from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.deps import DB

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=Health, operation_id="getHealth")
async def health(db: DB) -> Health:
    try:
        await db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    return Health(status="ok" if database == "ok" else "degraded", database=database)
