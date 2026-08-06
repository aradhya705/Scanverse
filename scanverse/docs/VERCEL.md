# Deploying on Vercel

## The honest architecture first

Vercel runs **frontend/serverless workloads only**. ScanVerse's backend is a
FastAPI app with OpenCV + torch/EasyOCR + PyMuPDF, a PostgreSQL database, and
a persistent `/app/uploads` filesystem — none of which fit Vercel. So the
deployment is split:

```
Vercel (static SPA)  ──direct HTTPS──▶  Backend host (Railway / Render / Fly / VPS)
  scan.vercel.app                         scanverse-api.example.com
```

The frontend calls the backend **directly** (not through a Vercel rewrite)
using `VITE_API_BASE_URL`. That keeps file uploads off Vercel's proxy
(which limits request bodies) and needs no per-deployment config changes.

## Step 1 — Deploy the backend

Pick one host. **Railway** is the fastest path (Dockerfile-native):

1. Push the repo to GitHub.
2. On Railway: **New Project → Deploy from GitHub repo** → create a service
   pointed at the `backend` directory (it detects `backend/Dockerfile`).
3. Add a **PostgreSQL** plugin; copy its `DATABASE_URL` into the backend
   service's env vars.
4. Set these environment variables on the backend service:

   | Var | Value |
   |---|---|
   | `ENVIRONMENT` | `production` |
   | `SECRET_KEY` | a long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
   | `DATABASE_URL` | from the Postgres plugin |
   | `CORS_ORIGINS` | `["https://your-app.vercel.app", "https://your-custom-domain.com"]` — **include the exact frontend origin(s)** |
   | `MAX_UPLOAD_MB` | your upload cap (default `25`) |

5. Give the service a **persistent volume** mounted at `/app/uploads` and
   `/app/exports` (two mounts, or a volume at `/app` — the app also needs
   `/app/exports`). Without these, scans and exports are lost on redeploy.
6. **Memory**: pick a plan with **≥ 2 GB RAM** — torch/EasyOCR loads its
   models into memory during OCR. The healthcheck path is `/health`.
7. Deploy. Railway gives you a public URL, e.g. `https://scanverse-api.up.railway.app`.
   Verify: `curl https://<your-backend-url>/health` → `{"status":"ok"}`.

> **Render** works the same way (Web Service → Docker, same env vars + disk).
> **Fly.io** is an option if you prefer `fly launch`. A plain **VPS** also
> works — see `docs/DEPLOYMENT.md`.

## Step 2 — Deploy the frontend to Vercel

1. Push the repo to GitHub (the `vercel.json` at the repo root is already set
   up: Vite framework, `dist` output, SPA fallback for client-side routes).
2. On Vercel: **Add New Project → Import** the GitHub repo. Vercel
   auto-detects Vite — leave `Build Command` / `Output Directory` as detected
   (`npm run build` / `dist`).
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://<your-backend-url>/api/v1` |

4. Deploy. Vercel serves `https://<project>.vercel.app` with automatic HTTPS.

> The service worker (`sw.js`) already bypasses caching for `/api/` and
> `/media/` paths, so pages with the new absolute URLs stay fresh.

## Step 3 — Verify

- Open the Vercel URL → landing page loads.
- Register an account → login → New Scan → upload a photo → OCR → export.
- Open the browser DevTools Network tab: `/api/v1/*` and `/media/uploads/*`
  requests should go to your backend URL directly and return 200.

## Gotchas

- **CORS**: the backend's `CORS_ORIGINS` must list your exact Vercel origin
  (including `https://`). Update it if you add a custom domain.
- **No env vars in `vercel.json`**: Vercel does not interpolate env vars in
  rewrite destinations — that's why the app uses `VITE_API_BASE_URL` in the
  frontend code instead of a rewrite to the backend.
- **Uploads**: they go straight to the backend, so Vercel's request-body
  limits don't apply — but the backend's `MAX_UPLOAD_MB` and your host's
  limits do.
- **Password reset in production**: the dev-only token response is disabled;
  the reset link must be emailed (SMTP is a roadmap item).
- **Storage**: uploaded files live on the backend host's volume, not Vercel.
  Back it up (`docs/DEPLOYMENT.md` has backup commands).
