from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_access_token(token)
    # Only "access"-purpose tokens count as login credentials; reset/other
    # one-time tokens must never be accepted by authenticated endpoints.
    # A missing purpose claim is treated as "access" so tokens minted before
    # the purpose claim existed keep working across upgrades.
    if user_id is None or user_id.get("purpose") not in (None, "access"):
        raise credentials_exception
    user = db.query(User).filter(User.id == user_id.get("sub")).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user
