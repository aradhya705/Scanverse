from typing import Literal

from pydantic import BaseModel, Field, model_validator

CompressionPreset = Literal["maximum_quality", "balanced", "maximum_compression", "custom"]


class CompressRequest(BaseModel):
    preset: CompressionPreset = "balanced"
    # Target size in bytes. Required when preset == "custom"; optional (but
    # honored if given) for the fixed presets, in which case we still try to
    # land as close as possible to it without exceeding it.
    target_size_bytes: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _validate_custom(self):
        if self.preset == "custom" and not self.target_size_bytes:
            raise ValueError("target_size_bytes is required when preset is 'custom'")
        return self


class CompressResponse(BaseModel):
    original_size_bytes: int
    compressed_size_bytes: int
    reduction_pct: float
    target_size_bytes: int | None
    target_achieved: bool
    preset: CompressionPreset
    quality_used: int
    scale_used: float
    download_filename: str
