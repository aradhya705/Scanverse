import os
import uuid

from PIL import Image, UnidentifiedImageError

from app.core.config import settings

# Maps the file extensions we accept to the actual image format(s) Pillow
# should find once it decodes the file. Extension alone is trivially spoofed
# (rename a .php or .svg to .jpg) so every upload is opened and re-verified
# against its real content before being trusted.
_EXTENSION_TO_FORMATS = {
    "jpg": {"JPEG"},
    "jpeg": {"JPEG"},
    "png": {"PNG"},
    "webp": {"WEBP"},
}


def validate_image_content(path: str, extension: str) -> None:
    """Raise ValueError if the file at `path` is not a genuine, decodable
    image matching its claimed extension. Deletes the file if invalid so no
    bad upload lingers on disk.

    This is a defense-in-depth check on top of extension filtering: an
    attacker-controlled filename with a `.jpg` extension but arbitrary bytes
    (a script, an oversized decompression bomb, a corrupt/malformed file
    crafted to exploit an image library) is caught here rather than being
    accepted and only failing later, unpredictably, wherever it's next read.
    """
    expected_formats = _EXTENSION_TO_FORMATS.get(extension)
    try:
        with Image.open(path) as img:
            img.verify()  # cheap structural check; doesn't decode pixel data
        # verify() closes the file object, so reopen to confirm it still
        # fully decodes (verify() alone misses some truncated-file cases)
        with Image.open(path) as img:
            img.load()
            actual_format = img.format
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        _safe_remove(path)
        raise ValueError("File is not a valid, readable image")

    if expected_formats and actual_format not in expected_formats:
        _safe_remove(path)
        raise ValueError(
            f"File content ({actual_format or 'unknown'}) does not match its .{extension} extension"
        )


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def user_dir(user_id: str) -> str:
    path = os.path.join(settings.UPLOAD_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path


def new_filename(extension: str = "jpg") -> str:
    return f"{uuid.uuid4()}.{extension}"


def user_export_dir(user_id: str) -> str:
    path = os.path.join(settings.EXPORT_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path
