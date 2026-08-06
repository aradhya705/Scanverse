from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.database import get_db
from app.db.models import User
from app.schemas.user import Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_must_be_strong(cls, value: str) -> str:
        """Same rules as account creation (see schemas/user.py)."""
        import re

        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[a-zA-Z]", value):
            raise ValueError("Password must include at least one letter")
        if not re.search(r"[0-9]", value):
            raise ValueError("Password must include at least one number")
        return value



# Rate limits below are deliberately tight and keyed by client IP: auth
# endpoints are the classic target for credential-stuffing / brute-force and
# account-enumeration-via-registration scripts, and unlike most of the API
# they're reachable without a token, so they get their own (stricter) budget
# rather than relying on any general per-user limit.
@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------
# In development the reset token is returned directly in the response so the
# flow is usable end-to-end without an SMTP server. In production the token
# must be emailed out instead — the response intentionally reveals nothing
# about whether the account exists (anti-enumeration), matching the generic
# copy on the frontend.
_RESET_TOKEN_MINUTES = 30


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    response: dict = {
        "detail": "If an account exists for that email, a reset link has been generated."
    }
    if user:
        reset_token = create_access_token(
            subject=user.id,
            expires_delta=timedelta(minutes=_RESET_TOKEN_MINUTES),
            purpose="password_reset",
        )
        if settings.ENVIRONMENT != "production":
            # Local/dev convenience: surface the token so the flow can be
            # exercised without mail delivery. Never expose this in prod.
            response["reset_token"] = reset_token
            response["expires_minutes"] = _RESET_TOKEN_MINUTES
    return response


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    claims = decode_access_token(payload.token)
    if (
        claims is None
        or claims.get("purpose") != "password_reset"
        or not claims.get("sub")
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.id == claims["sub"]).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"detail": "Password updated — you can now sign in with your new password"}
