"""Shared slowapi Limiter instance.

Kept in its own module (rather than defined inline in main.py) so route
modules can import and decorate endpoints with @limiter.limit(...) without
creating a circular import with the app entrypoint.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
