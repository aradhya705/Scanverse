"""
Image processing engine for ScanVerse.

Responsible for:
- Detecting document edges/corners in a raw photo
- Applying perspective correction ("deskew") given 4 corners
- Auto-enhancement (shadow removal, brightness, contrast, sharpness, white balance)
- Named filter presets with adjustable intensity/brightness/contrast/saturation/sharpness
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image, ImageEnhance


# --------------------------------------------------------------------------
# Corner / edge detection
# --------------------------------------------------------------------------

def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _quad_geometry_score(quad: np.ndarray, image_area: float) -> float:
    """Penalize quads that are a poor match for a real page: near-zero area,
    extreme aspect ratios, very non-rectangular angles, or areas that are
    barely inside the frame. Returns a 0-1 multiplier."""
    rect = _order_points(quad)
    (tl, tr, br, bl) = rect

    width = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2.0
    height = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2.0
    if width < 1 or height < 1:
        return 0.0

    aspect = max(width, height) / min(width, height)
    # Support extreme aspect ratios: receipts, wide banners, long scrolls.
    # Only penalize beyond 10:1 which is almost certainly a detection error.
    aspect_penalty = 1.0 if aspect <= 10.0 else max(0.0, 1.0 - (aspect - 10.0) / 10.0)

    # Check how close each interior angle is to 90 degrees
    def _angle(p0, p1, p2):
        v1, v2 = p0 - p1, p2 - p1
        cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        return np.degrees(np.arccos(np.clip(cos_a, -1.0, 1.0)))

    angles = [
        _angle(rect[3], rect[0], rect[1]),
        _angle(rect[0], rect[1], rect[2]),
        _angle(rect[1], rect[2], rect[3]),
        _angle(rect[2], rect[3], rect[0]),
    ]
    max_deviation = max(abs(a - 90) for a in angles)
    angle_penalty = max(0.0, 1.0 - max_deviation / 45.0)

    return float(aspect_penalty * angle_penalty)


def _refine_corners_subpixel(gray: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """Nudge each detected corner to the nearest true corner feature at
    sub-pixel accuracy, which measurably tightens the perspective warp
    versus using the raw polygon-approximation vertices."""
    try:
        pts = quad.reshape(-1, 1, 2).astype(np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01)
        refined = cv2.cornerSubPix(gray, pts, (11, 11), (-1, -1), criteria)
        return refined.reshape(-1, 2)
    except cv2.error:
        return quad


def _find_best_quad(edge_map: np.ndarray, image_area: float) -> tuple[np.ndarray | None, float]:
    """Given a binary edge/threshold map, find the contour whose polygon
    approximation is the best-scoring quadrilateral."""
    contours, _ = cv2.findContours(edge_map, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    best_quad = None
    best_score = 0.0
    for c in contours:
        peri = cv2.arcLength(c, True)
        for eps_ratio in (0.02, 0.03, 0.05):
            approx = cv2.approxPolyDP(c, eps_ratio * peri, True)
            if len(approx) == 4:
                break
        area = cv2.contourArea(c)
        if len(approx) == 4 and area > 0.12 * image_area and cv2.isContourConvex(approx):
            quad = approx.reshape(4, 2).astype("float32")
            geometry = _quad_geometry_score(quad, image_area)
            score = (area / image_area) * geometry
            if score > best_score:
                best_score = score
                best_quad = quad
    return best_quad, best_score


def detect_document_corners(image_bgr: np.ndarray) -> tuple[list[list[float]] | None, float]:
    """
    Attempt to detect the 4 corners of a document within the image.

    Runs several independent detection strategies — since no single one is
    reliable across lighting conditions — and keeps whichever result scores
    best on a combination of contour area and how rectangular the resulting
    quad actually is:

    1. Canny edge detection (best for a document with clear contrast against
       its background, the common case).
    2. Adaptive-threshold + morphological closing (better for low-contrast
       scenes, e.g. a white page on a light table, where Canny finds too
       many/too few edges to form one clean contour).
    3. Saturation-channel edges (helps when the page is white/neutral but the
       background is colorful, since hue/saturation separates the two better
       than luminance alone).

    Returns (corners, confidence) where corners is a list of 4 [x, y] points
    ordered TL, TR, BR, BL in original image coordinates, or (None, 0.0)
    if no reliable quadrilateral was found.
    """
    orig_h, orig_w = image_bgr.shape[:2]
    # Downscale for faster + more stable contour detection
    scale = 800.0 / max(orig_h, orig_w)
    resized = cv2.resize(image_bgr, (int(orig_w * scale), int(orig_h * scale)))
    image_area = resized.shape[0] * resized.shape[1]

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    candidates: list[tuple[np.ndarray, float, str]] = []

    # Strategy 1: Canny edges (primary — works well on most photos)
    edged = cv2.Canny(blurred, 50, 150)
    edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=2)
    edged = cv2.erode(edged, np.ones((3, 3), np.uint8), iterations=1)
    quad, score = _find_best_quad(edged, image_area)
    if quad is not None:
        candidates.append((quad, score, "canny"))

    # Strategy 2: adaptive threshold — more robust on low-contrast backgrounds
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10
    )
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    quad, score = _find_best_quad(thresh, image_area)
    if quad is not None:
        # Slight down-weight: this strategy is more prone to grabbing shadows
        candidates.append((quad, score * 0.92, "adaptive_threshold"))

    # Strategy 3: saturation-channel edges — helps separate a neutral page
    # from a colorful background/surface
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    sat_blurred = cv2.GaussianBlur(sat, (5, 5), 0)
    sat_edged = cv2.Canny(sat_blurred, 40, 120)
    sat_edged = cv2.dilate(sat_edged, np.ones((3, 3), np.uint8), iterations=2)
    quad, score = _find_best_quad(sat_edged, image_area)
    if quad is not None:
        candidates.append((quad, score * 0.9, "saturation"))

    if not candidates:
        return None, 0.0

    best_quad, best_score, _method = max(candidates, key=lambda c: c[1])

    # Sub-pixel corner refinement against the grayscale image for a tighter warp
    refined = _refine_corners_subpixel(gray, best_quad)

    ordered = _order_points(refined)
    # Scale back up to original resolution
    ordered_full = ordered / scale

    # Confidence blends contour/geometry score with agreement across
    # strategies (multiple independent methods landing on a similar quad is
    # a much stronger signal than one method alone).
    agreement_bonus = 0.0
    if len(candidates) > 1:
        areas = [cv2.contourArea(c[0].astype("float32")) for c in candidates]
        spread = (max(areas) - min(areas)) / (image_area + 1e-6)
        agreement_bonus = 0.1 if spread < 0.08 else 0.0

    confidence = min(0.99, best_score + 0.25 + agreement_bonus)
    return ordered_full.tolist(), round(float(confidence), 2)


def default_corners(width: int, height: int, margin_ratio: float = 0.0) -> list[list[float]]:
    """Fallback corners: the FULL image — no crop at all.

    The principle is "no crop is better than a wrong crop."  When edge
    detection fails, we preserve the complete original image instead of
    guessing a rectangle that may cut off content.
    """
    mx, my = width * margin_ratio, height * margin_ratio
    return [[mx, my], [width - mx, my], [width - mx, height - my], [mx, height - my]]


# --------------------------------------------------------------------------
# Perspective correction
# --------------------------------------------------------------------------

def warp_perspective(image_bgr: np.ndarray, corners: list[list[float]]) -> np.ndarray:
    """Apply a perspective transform so the quadrilateral defined by `corners`
    becomes a flat, upright rectangle."""
    rect = _order_points(np.array(corners, dtype="float32"))
    (tl, tr, br, bl) = rect

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = max(int(width_a), int(width_b), 1)

    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = max(int(height_a), int(height_b), 1)

    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )

    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image_bgr, matrix, (max_width, max_height))


# --------------------------------------------------------------------------
# Auto enhancement (shadow removal, white balance, sharpening)
# --------------------------------------------------------------------------

def remove_shadows(image_bgr: np.ndarray) -> np.ndarray:
    """Flattens uneven lighting/shadows using morphological background estimation."""
    rgb_planes = cv2.split(image_bgr)
    result_planes = []
    for plane in rgb_planes:
        dilated = cv2.dilate(plane, np.ones((7, 7), np.uint8))
        bg = cv2.medianBlur(dilated, 21)
        diff = 255 - cv2.absdiff(plane, bg)
        norm = cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
        result_planes.append(norm)
    return cv2.merge(result_planes)


def auto_white_balance(image_bgr: np.ndarray) -> np.ndarray:
    """Simple gray-world white balance."""
    result = image_bgr.astype(np.float32)
    for i in range(3):
        channel = result[:, :, i]
        mean = channel.mean()
        if mean > 0:
            result[:, :, i] = channel * (128.0 / mean)
    return np.clip(result, 0, 255).astype(np.uint8)


def denoise(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoisingColored(image_bgr, None, 5, 5, 7, 21)


def auto_enhance(image_bgr: np.ndarray) -> np.ndarray:
    """Full auto-enhancement pipeline: white balance -> shadow removal -> denoise -> CLAHE contrast."""
    img = auto_white_balance(image_bgr)
    img = remove_shadows(img)
    img = denoise(img)

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

    # Mild sharpen
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    img = cv2.filter2D(img, -1, kernel)
    return img


# --------------------------------------------------------------------------
# Filters
# --------------------------------------------------------------------------

FILTER_PRESETS = {
    "original": {},
    "auto": {"auto_enhance": True},
    "smart_document": {"smart_scan": True},
    "color_boost": {"saturation": 1.45, "contrast": 1.15, "brightness": 1.05},
    "clean_document": {"auto_enhance": True, "contrast": 1.2, "brightness": 1.08, "sharpness": 1.3},
    "black_and_white": {"grayscale": True, "contrast": 1.15},
    "high_contrast": {"grayscale": True, "contrast": 1.6, "brightness": 1.0},
    "soft_gray": {"grayscale": True, "contrast": 0.9, "brightness": 1.1},  # legacy value, kept for old saved pages
    "warm_paper": {"warm_tint": True, "brightness": 1.05, "contrast": 1.05},
    "cool_tone": {"cool_tint": True, "brightness": 1.02, "contrast": 1.05},
    # --- extended filter set ---
    "magic_color": {"auto_enhance": True, "saturation": 1.35, "contrast": 1.12, "brightness": 1.04},
    "grayscale": {"grayscale": True},
    "soft": {"contrast": 0.85, "brightness": 1.08, "saturation": 0.85},
    "bright": {"brightness": 1.35, "contrast": 1.05},
    "dark": {"brightness": 0.75, "contrast": 1.15},
    "blueprint": {"blueprint": True},
    "newspaper": {"newspaper": True},
    "pencil": {"pencil": True},
    "ink": {"ink": True},
    "vintage": {"vintage": True},
}


def _blueprint_effect(image_bgr: np.ndarray) -> np.ndarray:
    """Cyanotype-style look: bright blue-white ink on a dark navy background."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    inv = 1.0 - gray  # dark ink/text -> high value
    b = (60 + inv * 195).clip(0, 255).astype(np.uint8)
    g = (20 + inv * 130).clip(0, 255).astype(np.uint8)
    r = (10 + inv * 45).clip(0, 255).astype(np.uint8)
    return cv2.merge([b, g, r])


def _newspaper_effect(image_bgr: np.ndarray) -> np.ndarray:
    """Halftone-dithered grayscale, evoking cheap newsprint."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32)
    bayer = bayer / 16.0 * 255.0
    h, w = gray.shape
    tile = np.tile(bayer, (h // 4 + 1, w // 4 + 1))[:h, :w]
    dithered = (gray.astype(np.float32) > tile).astype(np.uint8) * 255
    blended = cv2.addWeighted(gray, 0.4, dithered, 0.6, 0)
    return cv2.cvtColor(blended, cv2.COLOR_GRAY2BGR)


def _pencil_effect(image_bgr: np.ndarray) -> np.ndarray:
    """Graphite pencil-sketch look via OpenCV's edge-preserving pencilSketch."""
    gray_sketch, _color_sketch = cv2.pencilSketch(image_bgr, sigma_s=60, sigma_r=0.07, shade_factor=0.05)
    return cv2.cvtColor(gray_sketch, cv2.COLOR_GRAY2BGR)


def _ink_effect(image_bgr: np.ndarray) -> np.ndarray:
    """Black ink line-art on white, via adaptive thresholding."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 8
    )
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)


def _vintage_effect(image_bgr: np.ndarray) -> np.ndarray:
    """Sepia tone with a soft vignette."""
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
    sepia_matrix = np.array(
        [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]
    )
    sepia_rgb = np.clip(cv2.transform(rgb, sepia_matrix), 0, 255).astype(np.uint8)
    bgr = cv2.cvtColor(sepia_rgb, cv2.COLOR_RGB2BGR)

    h, w = bgr.shape[:2]
    y_idx, x_idx = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt((x_idx - cx) ** 2 + (y_idx - cy) ** 2)
    max_dist = np.sqrt(cx**2 + cy**2) or 1.0
    vignette = np.clip(1 - 0.35 * (dist / max_dist), 0.6, 1.0)[..., None]
    return (bgr.astype(np.float32) * vignette).astype(np.uint8)


def _apply_tint(pil_img: Image.Image, warm: bool) -> Image.Image:
    r, g, b = pil_img.convert("RGB").split()
    if warm:
        r = r.point(lambda i: min(255, int(i * 1.08)))
        b = b.point(lambda i: max(0, int(i * 0.92)))
    else:
        b = b.point(lambda i: min(255, int(i * 1.08)))
        r = r.point(lambda i: max(0, int(i * 0.94)))
    return Image.merge("RGB", (r, g, b))


def smart_document_enhance(image_bgr: np.ndarray) -> np.ndarray:
    """Adobe Scan-style "Auto": a clean document in one pass, choosing the
    right look for the page.

    If the image is essentially monochrome (text-only scans, receipts,
    printed pages), it returns a crisp black & white document. If it has
    meaningful color content (photos, magazines, colored paper), it returns
    a clean color document instead. The decision is made from the fraction
    of pixels with real saturation, so a white page with one small colored
    logo still comes out looking like a clean scan.
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    colorful_ratio = float((saturation > 60).sum()) / saturation.size
    if colorful_ratio < 0.004:
        # Crisp black & white for text-only pages
        return apply_filter(image_bgr, "black_and_white", intensity=1.0)
    # Clean color document: white-balance the shot, then a color/contrast
    # lift. Deliberately avoids the shadow-normalization pass used by
    # auto_enhance — normalizing each channel independently flattens
    # colored regions into gray.
    balanced = auto_white_balance(image_bgr)
    return apply_filter(balanced, "color_boost", intensity=1.0)


def apply_filter(
    image_bgr: np.ndarray,
    filter_name: str,
    *,
    intensity: float = 1.0,
    brightness: float | None = None,
    contrast: float | None = None,
    saturation: float | None = None,
    sharpness: float | None = None,
) -> np.ndarray:
    """Apply a named filter preset, then any explicit adjustment overrides.

    `intensity` (0-2, default 1.0) blends the preset effect with the original.
    """
    preset = FILTER_PRESETS.get(filter_name, FILTER_PRESETS["original"])
    working = image_bgr.copy()

    if preset.get("smart_scan"):
        return smart_document_enhance(image_bgr)

    if preset.get("auto_enhance"):
        working = auto_enhance(working)

    if preset.get("blueprint"):
        working = _blueprint_effect(working)
    elif preset.get("newspaper"):
        working = _newspaper_effect(working)
    elif preset.get("pencil"):
        working = _pencil_effect(working)
    elif preset.get("ink"):
        working = _ink_effect(working)
    elif preset.get("vintage"):
        working = _vintage_effect(working)

    pil_img = Image.fromarray(cv2.cvtColor(working, cv2.COLOR_BGR2RGB))

    if preset.get("grayscale"):
        pil_img = pil_img.convert("L").convert("RGB")
    if preset.get("warm_tint"):
        pil_img = _apply_tint(pil_img, warm=True)
    if preset.get("cool_tint"):
        pil_img = _apply_tint(pil_img, warm=False)

    b = brightness if brightness is not None else preset.get("brightness", 1.0)
    c = contrast if contrast is not None else preset.get("contrast", 1.0)
    s = saturation if saturation is not None else preset.get("saturation", 1.0)
    sh = sharpness if sharpness is not None else preset.get("sharpness", 1.0)

    pil_img = ImageEnhance.Brightness(pil_img).enhance(b)
    pil_img = ImageEnhance.Contrast(pil_img).enhance(c)
    pil_img = ImageEnhance.Color(pil_img).enhance(s)
    pil_img = ImageEnhance.Sharpness(pil_img).enhance(sh)

    result_rgb = np.array(pil_img)
    result_bgr = cv2.cvtColor(result_rgb, cv2.COLOR_RGB2BGR)

    if intensity != 1.0 and filter_name != "original":
        intensity = max(0.0, min(2.0, intensity))
        result_bgr = cv2.addWeighted(result_bgr, intensity, image_bgr, max(0.0, 1 - intensity), 0)

    return result_bgr


def cleanup_regions(image_bgr: np.ndarray, regions: list[list[float]], pad: int = 6) -> np.ndarray:
    """Remove stains/marks/handwriting the user has brushed over.

    `regions` is a list of [x, y, w, h] rectangles in the image's own pixel
    coordinates. A mask is built from those rectangles (with a small pad so
    edges blend cleanly) and filled in via Telea inpainting, which reads the
    surrounding page texture/color rather than just flattening to white —
    important for documents that aren't pure white paper.
    """
    if not regions:
        return image_bgr

    h, w = image_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    for rect in regions:
        if len(rect) != 4:
            continue
        x, y, rw, rh = rect
        x0 = max(0, int(x) - pad)
        y0 = max(0, int(y) - pad)
        x1 = min(w, int(x + rw) + pad)
        y1 = min(h, int(y + rh) + pad)
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = 255

    if not mask.any():
        return image_bgr

    return cv2.inpaint(image_bgr, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)


def rotate_image(image_bgr: np.ndarray, degrees: int) -> np.ndarray:
    degrees = degrees % 360
    if degrees == 0:
        return image_bgr
    if degrees == 90:
        return cv2.rotate(image_bgr, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(image_bgr, cv2.ROTATE_180)
    if degrees == 270:
        return cv2.rotate(image_bgr, cv2.ROTATE_90_COUNTERCLOCKWISE)
    # Arbitrary angle fallback
    h, w = image_bgr.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), -degrees, 1.0)
    return cv2.warpAffine(image_bgr, matrix, (w, h))


# --------------------------------------------------------------------------
# OCR pre-processing
# --------------------------------------------------------------------------

def estimate_skew_angle(image_bgr: np.ndarray) -> float:
    """Estimate the small residual rotation (in degrees) of text lines in an
    already-cropped document image, via the minimum-area rectangle of dark
    (ink) pixels. Perspective correction squares up the page edges, but the
    text itself can still be a few degrees off if the original photo wasn't
    perfectly aligned to the detected quad — this catches that remainder so
    OCR reads horizontal lines instead of a slight diagonal.
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    thresh = cv2.dilate(thresh, np.ones((3, 25), np.uint8), iterations=1)  # merge into text-line blobs

    coords = cv2.findNonZero(thresh)
    if coords is None or len(coords) < 20:
        return 0.0

    angle = cv2.minAreaRect(coords)[-1]
    # cv2.minAreaRect returns an angle in [-90, 0); normalize to a small
    # rotation around 0 degrees rather than snapping to the nearest edge.
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    # Ignore implausibly large "skew" — almost always a false read from a
    # sparse/near-empty page, not real rotation.
    if abs(angle) > 15:
        return 0.0
    return round(float(angle), 2)


def deskew(image_bgr: np.ndarray, angle: float | None = None) -> np.ndarray:
    """Rotate by a small angle to straighten text lines. If `angle` isn't
    given, it's estimated automatically."""
    if angle is None:
        angle = estimate_skew_angle(image_bgr)
    if abs(angle) < 0.3:
        return image_bgr
    h, w = image_bgr.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(
        image_bgr, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def prepare_for_ocr(image_bgr: np.ndarray, *, auto_deskew: bool = True) -> np.ndarray:
    """Lightweight preprocessing for OCR: grayscale + CLAHE + Otsu binarization.

    Kept intentionally simple to avoid timeouts and OOM on free-tier
    deployments (Railway/Render have 512MB RAM).  The bilateral filter,
    unsharp mask, and morphological passes were removed because they
    were the primary bottleneck (10-30s on large images).
    """
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # CLAHE contrast boost — helps separate text from background
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Otsu binarization — clean black-and-white for Tesseract
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Convert back to 3-channel BGR
    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def make_thumbnail(image_bgr: np.ndarray, max_size: int = 320) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    scale = max_size / max(h, w)
    if scale >= 1:
        return image_bgr
    return cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
