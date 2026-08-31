from pydantic import BaseModel


class CompressImageResponse(BaseModel):
    original_size_bytes: int
    compressed_size_bytes: int
    reduction_pct: float
    target_size_bytes: int | None
    target_achieved: bool
    format_used: str
    quality_used: int
    scale_used: float
    download_filename: str


class ConvertImageResponse(BaseModel):
    original_size_bytes: int
    output_size_bytes: int
    format_used: str
    download_filename: str


class BatchConvertResponse(BaseModel):
    page_count: int
    download_filename: str
