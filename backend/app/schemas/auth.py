from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import UserOut


class SignInRequest(BaseModel):
    username: str = Field(max_length=64)
    # False: an unknown username returns `needs_confirmation` instead of creating it.
    create: bool = False


class SignInResponse(BaseModel):
    status: Literal["signed_in", "needs_confirmation"]
    username: str
    user: UserOut | None = None


class MeResponse(BaseModel):
    user: UserOut | None
