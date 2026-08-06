# API reference

Interactive Swagger docs (auto-generated from the FastAPI app) live at
**`/docs`** — proxied at `http://localhost:8080/docs`, or directly at
`http://localhost:8000/docs`.

Base path: `/api/v1`. All endpoints except `auth/*` and `health` require the
`Authorization: Bearer <token>` header. Login/register return an
`access_token`; the frontend stores it in `scanverse_token`.

## Auth — `/auth`

| Method | Path | Body / Params | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, full_name?}` | Creates account, returns token. Rate-limited 5/min/IP. |
| POST | `/auth/login` | form `username` (email) + `password` | Returns token. Rate-limited 10/min/IP. |
| GET | `/auth/me` | — | Current user profile. |
| POST | `/auth/forgot-password` | `{email}` | Rate-limited 5/min/IP. Dev mode returns `reset_token` in the response; production only returns a generic message (must be emailed). |
| POST | `/auth/reset-password` | `{token, new_password}` | Sets a new password from a 30-minute reset token. |

## Documents — `/documents`

| Method | Path | Notes |
|---|---|---|
| GET | `/documents` | List. Query: `q` (title + OCR text search), `category`, `favorites_only` |
| GET | `/documents/{id}` | Full document with all pages (incl. media URLs) |
| PATCH | `/documents/{id}` | Update `title`, `category`, `tags`, `is_favorite` |
| DELETE | `/documents/{id}` | Deletes rows + files |

## Scan — `/scan`

| Method | Path | Notes |
|---|---|---|
| POST | `/scan/upload` | Multipart `file` (+ optional `document_id`). Runs auto edge detection, creates a page. |
| GET | `/scan/pages/{id}/detection` | Re-run detection; returns corners + confidence |
| POST | `/scan/pages/{id}/process` | `{corners?, rotation?, filter_applied?, brightness?, contrast?, saturation?, sharpness?, intensity?}` → writes processed image + thumbnail |
| POST | `/scan/pages/{id}/retake` | Replace the page's photo in place |
| POST | `/scan/pages/{id}/cleanup` | `{regions: [[x,y,w,h]…]}` — inpaint stains/marks |
| POST | `/scan/pages/{id}/duplicate` | Clone the page |
| POST | `/scan/pages/{id}/signature` | `{signature_png_b64, x, y, width_fraction, opacity}` — composite a signature onto the page |
| DELETE | `/scan/pages/{id}` | Delete a page |
| POST | `/scan/documents/{id}/reorder` | `{page_ids_in_order: [...]}` |

Media URLs are returned as `/media/uploads/...` on each page
(`original_url`, `processed_url`, `thumbnail_url`).

## OCR — `/ocr`

| Method | Path | Notes |
|---|---|---|
| POST | `/ocr/pages/{id}` | Run OCR on a page. Query: `language`, `languages` (comma-separated), `preprocess`, `auto_deskew`. Returns full text + per-line confidence. |
| POST | `/ocr/documents/{id}` | OCR every page in one call |
| GET | `/ocr/pages/{id}` | Stored page text |
| PATCH | `/ocr/pages/{id}` | `{ocr_text}` — edit stored text |

## Export — `/export`

| Method | Path | Notes |
|---|---|---|
| GET | `/export/documents/{id}` | `?format=pdf\|docx\|txt`. TXT requires OCR text. Streams the file for download. |

## PDF tools — `/pdf-tools`

| Method | Path | Notes |
|---|---|---|
| POST | `/pdf-tools/documents/{id}/compress` | `{preset: maximum_quality\|balanced\|maximum_compression\|custom, target_size_bytes?}`. Returns original/compressed sizes, reduction %, target-achieved, quality & scale used. |
| POST | `/pdf-tools/merge` | Multipart `files[]` → merged PDF |
| POST | `/pdf-tools/split` | Multipart `file` → zip of one-PDF-per-page |
| POST | `/pdf-tools/extract` | Multipart `file` + form `pages="1,3,5"` → PDF with those pages |
| POST | `/pdf-tools/delete-pages` | Multipart `file` + form `pages="2,4"` → remaining PDF |
| POST | `/pdf-tools/rearrange` | Multipart `file` + form `order="3,1,2"` → reordered PDF |
| GET | `/pdf-tools/download/{filename}` | Fetch a generated output (server-generated filenames only) |

## Image tools — `/image-tools`

| Method | Path | Notes |
|---|---|---|
| POST | `/image-tools/compress` | Multipart `file` + `target_size_bytes?`, `output_format?` (jpg/png/webp/tiff). HEIC readable. |
| POST | `/image-tools/convert` | Multipart `file` + `target_format` (jpg/png/webp/tiff/bmp/gif) |
| POST | `/image-tools/images-to-pdf` | Multipart `files[]` → single PDF |
| POST | `/image-tools/pdf-to-images` | Multipart `file` + `image_format` (png/jpg) → zip |
| GET | `/image-tools/download/{filename}` | Fetch a generated output |

## Stats — `/stats`

| Method | Path | Notes |
|---|---|---|
| GET | `/stats` | Dashboard aggregates: document/page/favorite counts, total storage bytes, OCR character count, recently-edited list. |

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness probe (used by Docker healthchecks). |

## Common errors

| Status | Meaning |
|---|---|
| 400 | Validation failure, unsupported format, bad page list |
| 401 | Missing/invalid token (frontend auto-redirects to `/login`) |
| 404 | Document/page/file not found (scoped to the current user) |
| 413 | Upload exceeds `MAX_UPLOAD_MB` |
| 422 | Image/PDF could not be decoded or processed |
| 429 | Rate limit exceeded (auth endpoints) |
