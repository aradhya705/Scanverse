# Roadmap

ScanVerse is built to spec-first: the core scan pipeline (detection →
correction → filters → multi-page editing → OCR → export) is solid, and the
highest-value tooling around it is now in place.

## Shipped since the core build

| Feature | Where |
|---|---|
| Target-size PDF compression (50 KB → 100 MB, custom KB/MB/GB) | `pdf_compression_service.py` + `/pdf-tools/documents/{id}/compress` |
| Target-size image compression (JPG/PNG/WEBP/TIFF, HEIC input) | `image_compression_service.py` + `/image-tools` + "Image Tools" page |
| 10 extra filters (18 total: Magic Color → Vintage) | `image_processing.py::FILTER_PRESETS` |
| Advanced detection (3 strategies, geometry scoring, sub-pixel corners, agreement bonus) | `detect_document_corners` |
| OCR quality pass (deskew, shadow removal, per-line confidence, document-wide OCR) | `prepare_for_ocr`, `ocr_service.py`, `POST /ocr/documents/{id}` |
| Security (rate limiting, upload content validation, headers, prod secret check) | `limiter.py`, `utils/files.py`, `main.py` |
| PDF tools: merge / split / extract / delete / rearrange pages | `pdf_tools_service.py` + 5 endpoints + "PDF Tools" page |
| E-signatures (draw/upload, placement, size, opacity → composited on page) | `signature_service.py` + `POST /scan/pages/{id}/signature` + `SignaturePad`/`SignatureModal` |
| Password reset (dev token flow, SMTP-ready) | `/auth/forgot-password`, `/auth/reset-password` |
| Dashboard stats (storage usage, recently edited, skeletons) | `stats.py` + `Dashboard.tsx` |
| Mobile bottom nav + FAB, theme toggle, route-level code splitting, toast polish | `MobileNav.tsx`, `ThemeToggle.tsx`, `App.tsx` |
| Backend unit tests (41, no DB required) | `backend/tests/` |
| Docs (install, env, API, architecture, deploy) | `docs/` |

## Deferred features and where they'd land

| Feature | Where it plugs in |
|---|---|
| Email delivery for password reset / verification | Add SMTP settings + an emailer in `core`; `auth.py::forgot_password` already returns the token only in dev. Email verification would add an `is_verified` column + a verify endpoint. |
| Google / OAuth login | New `/auth/google` flow with `authlib`; `User` gains `oauth_provider`/`oauth_id` columns. Needs Google Cloud OAuth credentials — configure at deploy time. |
| Folders as first-class entities | `Document.category` already acts as a folder; a `Folder` table + move UI is an additive migration. |
| Live camera viewfinder with on-screen edge detection | A `getUserMedia` component in `NewScan.tsx` drawing the detected quad live; capture sends the frame to `/scan/upload`. Native camera capture (PWA `<input capture>`) already covers most phones. |
| Draw/annotate on pages (pen, highlighter, shapes, text boxes, sticky notes) | A canvas overlay editor like `CleanupBrush.tsx` but rendering strokes as a transparent layer baked via a new `POST /scan/pages/{id}/annotate`. |
| Activity history (compress/OCR/conversion logs) | A lightweight `Activity` table recorded in the relevant routes + a dashboard feed. |
| Background OCR/compression queue | FastAPI `BackgroundTasks` first, then Celery/arq; today OCR runs synchronously per request. |
| Analytics charts | `analytics.py` aggregating documents by date + a charts page. |
| Full-text search ranking | Swap the `ILIKE` in `documents.py` for Postgres `tsvector`. |
| Smart categories / auto-tagging | A classifier step after OCR writing `category`/`tags` (columns already exist). |
| Duplicate scan detection | Embeddings column/table; additive migration. |
| Chat with documents (RAG) / summarization / translation | A service calling an LLM keyed off `Document.ocr_text`. |
| S3-compatible storage | Swap `utils/files.py` + the static mounts in `main.py`. |

## Known trade-offs

- OCR runs synchronously in the request — single pages are fine, big
  multi-page jobs should move to a queue.
- EasyOCR caches models in process memory; multi-replica deployments should
  pin OCR to a dedicated worker.
- Corner detection is classical OpenCV (fast, no model downloads) rather than
  a learned segmentation model; the manual corner handles cover the gap.
- Files are stored on local disk; cloud storage is a one-seam swap.
