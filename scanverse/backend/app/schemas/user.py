import re

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator

# Deliberately readable/composable rather than exotic-character-mandatory:
# length plus a mix of character classes stops trivial/dictionary passwords
# without pushing people toward "Password1!" patterns that satisfy a strict
# regex but aren't actually stronger.
_MIN_PASSWORD_LENGTH = 8


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_must_be_strong(cls, value: str) -> str:
        if len(value) < _MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {_MIN_PASSWORD_LENGTH} characters long")
        if not re.search(r"[a-zA-Z]", value):
            raise ValueError("Password must include at least one letter")
        if not re.search(r"[0-9]", value):
            raise ValueError("Password must include at least one number")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str | None = None
    is_active: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
