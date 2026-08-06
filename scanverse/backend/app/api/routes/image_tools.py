import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import User
from app.schemas.image_tools import (
    BatchConvertResponse,
    CompressImageResponse,
    ConvertImageResponse,
)
from app.services import export_service
from app.services import image_compression_service as ics
from app.services import image_conversion_service as icv
from app.utils.files import user_export_dir

router = APIRouter(prefix="/image-tools", tags=["image-tools"])

ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "tiff", "tif", "heic", "heif", "bmp", "gif"}
ALLOWED_OUTPUT_FORMATS = {"jpg", "jpeg", "png", "webp", "tiff"}
CONVERT_TARGET_FORMATS = {"jpg", "jpeg", "png", "webp", "tiff", "bmp", "gif"}


@router.post("/compress", response_model=CompressImageResponse)
async def compress_image(
    file: UploadFile = File(...),
    target_size_bytes: int | None = Form(default=None),
    output_format: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")
    if output_format and output_format.lower() not in ALLOWED_OUTPUT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported output format: {output_format}")
    if target_size_bytes is not None and target_size_bytes <= 0:
        raise HTTPException(status_code=400, detail="target_size_bytes must be positive")
    if (ext in ("heic", "heif")) and not ics.HEIF_AVAILABLE:
        raise HTTPException(
            status_code=422, detail="HEIC support isn't installed on this server (pillow-heif missing)"
        )

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit"
        )

    work_dir = user_export_dir(current_user.id)
    source_path = os.path.join(work_dir, f".imgsrc_{uuid.uuid4()}.{ext}")
    with open(source_path, "wb") as f:
        f.write(contents)

    out_ext = (output_format or ("jpg" if ext in ("heic", "heif") else ext)).lower()
    out_ext = "jpg" if out_ext == "jpeg" else out_ext
    download_filename = f"compressed_img_{uuid.uuid4()}.{out_ext}"
    output_path = os.path.join(work_dir, download_filename)

    try:
        stats = ics.compress_image(
            input_path=source_path,
            output_path=output_path,
            target_size_bytes=target_size_bytes,
            output_format=output_format,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not process image: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return CompressImageResponse(**stats, download_filename=download_filename)


@router.post("/convert", response_model=ConvertImageResponse)
async def convert_image(
    file: UploadFile = File(...),
    target_format: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")
    target_format = target_format.lower()
    if target_format not in CONVERT_TARGET_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported target format: {target_format}")
    if ext in ("heic", "heif") and not icv.HEIF_AVAILABLE:
        raise HTTPException(
            status_code=422, detail="HEIC support isn't installed on this server (pillow-heif missing)"
        )

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit"
        )

    work_dir = user_export_dir(current_user.id)
    source_path = os.path.join(work_dir, f".imgsrc_{uuid.uuid4()}.{ext}")
    with open(source_path, "wb") as f:
        f.write(contents)

    out_ext = "jpg" if target_format == "jpeg" else target_format
    download_filename = f"converted_{uuid.uuid4()}.{out_ext}"
    output_path = os.path.join(work_dir, download_filename)

    try:
        stats = icv.convert_image(source_path, output_path, target_format)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not convert image: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)

    return ConvertImageResponse(**stats, download_filename=download_filename)


@router.post("/pdf-to-images", response_model=BatchConvertResponse)
async def pdf_to_images(
    file: UploadFile = File(...),
    image_format: str = Form(default="png"),
    current_user: User = Depends(get_current_user),
):
    ext = (file.filename or "doc.pdf").rsplit(".", 1)[-1].lower()
    if ext != "pdf":
        raise HTTPException(status_code=400, detail="Expected a .pdf file")
    image_format = image_format.lower()
    if image_format not in CONVERT_TARGET_FORMATS - {"bmp", "gif"}:
        raise HTTPException(status_code=400, detail=f"Unsupported image format: {image_format}")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit"
        )

    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_path = os.path.join(work_dir, f".pdfsrc_{batch_id}.pdf")
    with open(source_path, "wb") as f:
        f.write(contents)

    page_dir = os.path.join(work_dir, f".pages_{batch_id}")
    os.makedirs(page_dir, exist_ok=True)
    download_filename = f"converted_pages_{batch_id}.zip"
    zip_path = os.path.join(work_dir, download_filename)

    try:
        page_paths = icv.pdf_to_images(source_path, page_dir, image_format=image_format)
        if not page_paths:
            raise HTTPException(status_code=400, detail="PDF has no pages")
        icv.zip_files(page_paths, zip_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not convert PDF: {exc}") from exc
    finally:
        if os.path.exists(source_path):
            os.remove(source_path)
        shutil.rmtree(page_dir, ignore_errors=True)

    return BatchConvertResponse(page_count=len(page_paths), download_filename=download_filename)


@router.post("/images-to-pdf", response_model=BatchConvertResponse)
async def images_to_pdf(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No images provided")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    work_dir = user_export_dir(current_user.id)
    batch_id = uuid.uuid4()
    source_paths: list[str] = []

    try:
        for i, file in enumerate(files):
            ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
            if ext not in ALLOWED_EXT:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")
            contents = await file.read()
            if len(contents) > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"'{file.filename}' exceeds the {settings.MAX_UPLOAD_MB} MB upload limit",
                )
            path = os.path.join(work_dir, f".imgsrc_{batch_id}_{i:03d}.{ext}")
            with open(path, "wb") as f:
                f.write(contents)
            source_paths.append(path)

        download_filename = f"converted_images_{batch_id}.pdf"
        output_path = os.path.join(work_dir, download_filename)
        export_service.build_pdf(source_paths, output_path)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not build PDF: {exc}") from exc
    finally:
        for path in source_paths:
            if os.path.exists(path):
                os.remove(path)

    return BatchConvertResponse(page_count=len(source_paths), download_filename=download_filename)


@router.get("/download/{filename}")
def download_compressed_image(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    valid_prefixes = ("compressed_img_", "converted_")
    if filename != os.path.basename(filename) or not filename.startswith(valid_prefixes):
        raise HTTPException(status_code=400, detail="Invalid filename")

    work_dir = user_export_dir(current_user.id)
    path = os.path.join(work_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = filename.rsplit(".", 1)[-1].lower()
    media_type = {
        "jpg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "tiff": "image/tiff",
        "bmp": "image/bmp",
        "gif": "image/gif",
        "pdf": "application/pdf",
        "zip": "application/zip",
    }.get(ext, "application/octet-stream")

    return FileResponse(path=path, media_type=media_type, filename=f"download.{ext}")
