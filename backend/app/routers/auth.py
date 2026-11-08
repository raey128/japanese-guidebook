"""Username sign-in (R1). No passwords, no email."""

from fastapi import APIRouter, HTTPException, Request, Response, status

from app import identity
from app.config import get_settings
from app.deps import DB, AdminUser, OptionalUser
from app.schemas.auth import MeResponse, SignInRequest, SignInResponse
from app.schemas.common import Message, UserOut

router = APIRouter(tags=["auth"])


@router.post(
    "/auth/sign-in",
    response_model=SignInResponse,
    responses={400: {"model": Message}},
    operation_id="signIn",
)
async def sign_in(body: SignInRequest, response: Response, db: DB) -> SignInResponse:
    username = identity.normalize_username(body.username)
    try:
        identity.validate_username(username)
    except identity.UsernameError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    user = await identity.find_user(db, username)
    if user is not None and user.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That username is reserved. Please pick another.")
    if user is None:
        if not body.create:
            return SignInResponse(status="needs_confirmation", username=username)
        try:
            user = await identity.create_user(db, username)
        except identity.UsernameError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    token, expires_at = await identity.create_session(db, user)
    await db.commit()
    s = get_settings()
    response.set_cookie(
        s.session_cookie_name,
        token,
        expires=expires_at,
        max_age=s.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=s.cookie_secure,
        path="/",
    )
    return SignInResponse(status="signed_in", username=user.username, user=UserOut.model_validate(user))


@router.post("/auth/sign-out", status_code=204, operation_id="signOut")
async def sign_out(request: Request, response: Response, db: DB) -> Response:
    s = get_settings()
    token = request.cookies.get(s.session_cookie_name)
    if token:
        await identity.delete_session(db, token)
        await db.commit()
    response = Response(status_code=204)
    response.delete_cookie(s.session_cookie_name, path="/", httponly=True, samesite="lax")
    return response


@router.get("/me", response_model=MeResponse, operation_id="getMe")
async def me(user: OptionalUser) -> MeResponse:
    return MeResponse(user=UserOut.model_validate(user) if user else None)


@router.get("/admin/ping", response_model=Message, operation_id="adminPing")
async def admin_ping(_: AdminUser) -> Message:
    return Message(detail="ok")
