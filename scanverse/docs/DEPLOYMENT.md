# Deployment & troubleshooting

## Production checklist

1. **Secret key** — `SECRET_KEY` in `backend/.env` must be a long random
   string. With `ENVIRONMENT=production` the backend **refuses to start**
   otherwise.
2. **Set `ENVIRONMENT=production`** — enables HSTS and hides password-reset
   tokens from API responses.
3. **Don't publish internals** — for a real deployment remove the `ports:`
   entries for `db` and `backend` in `docker-compose.yml`; let Nginx
   (`:8080`) be the only public entry point.
4. **Persistent volumes** — `scanverse_db_data`, `scanverse_uploads`,
   `scanverse_exports` are named volumes; back them up (`docker volume` or a
   host bind mount).
5. **TLS** — terminate HTTPS at a load balancer or add certs to the Nginx
   config (the API already sets `Strict-Transport-Security` when
   `ENVIRONMENT=production`).
6. **Limits** — `client_max_body_size 30M` in `nginx/nginx.conf` and
   `MAX_UPLOAD_MB=25` in the backend should be raised or lowered together.
7. **CORS** — add your real origin(s) to `CORS_ORIGINS`.

## Deploying — step by step (Linux VPS, the standard path)

### 1. Push the project to a git repo

```bash
git init && git add -A && git commit -m "ScanVerse"
git remote add origin <your-github-url>
git push -u origin main
```

> The local-only `docker-compose.override.yml` (db port remap) is gitignored,
> so it will **not** ship to the server — good.

### 2. Provision a server

Any Linux VPS with Docker works. Recommended minimum:

- **OS**: Ubuntu 22.04 or 24.04
- **RAM**: 2 GB (Tesseract OCR is lightweight; 4 GB is comfortable headroom)
- **Disk**: 15 GB+ (the backend image is ~1.5 GB)
- **Domain** pointing at the server's IP (for HTTPS)

### 3. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in after this
# verify:
docker --version && docker compose version
```

### 4. Clone + create production env

```bash
git clone <your-repo-url> && cd scanverse
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set **production values**:

```ini
ENVIRONMENT=production
SECRET_KEY=<long random string>   # python -c "import secrets; print(secrets.token_urlsafe(48))"
CORS_ORIGINS=["https://scan.yourdomain.com"]
# everything else can stay at its default
```

The backend **refuses to start** with `ENVIRONMENT=production` + the default
`SECRET_KEY` — this guard is on purpose.

### 5. Harden docker-compose.yml for production

Open `docker-compose.yml` and **remove the `ports:` blocks** from `db` and
`backend` so only nginx (`:8080`) is public:

```yaml
  db:
    # ports:                      <- delete these two lines
    #   - "5432:5432"
  backend:
    # ports:                      <- delete these two lines
    #   - "8000:8000"
```

(Leave the `nginx` service's `8080:80`.) This is a manual edit; if you'd
rather keep the file untouched, you can instead leave the ports and block
them with your host firewall: `sudo ufw allow 80,443/tcp` and deny 8000/5432.

### 6. Build and start

```bash
docker compose up -d --build
```

First build takes **5–10 minutes**. Subsequent builds reuse the layer cache.

### 7. Verify

```bash
docker compose ps                 # all four: healthy/running
docker compose logs -f backend    # watch migrations + uvicorn boot
curl http://<server-ip>:8080/health   # -> {"status":"ok"}
```

### 8. HTTPS (required for camera/PWA on phones)

**Option A — Caddy (simplest):** add a `caddy` service to compose, or run on
the host:

```caddyfile
scan.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy auto-provisions Let's Encrypt certs and handles renewal.

**Option B — Certbot with the existing nginx:** install certbot, add your
domain to a server block, then `sudo certbot --nginx`. Renewal is automatic
via systemd timers.

> The backend already sends `Strict-Transport-Security` when
> `ENVIRONMENT=production`, so once HTTPS is up, browsers enforce it.

### 9. Backups (do this before you have real data)

```bash
# Postgres (nightly cron)
docker compose exec -T db pg_dump -U scanverse scanverse > scanverse_$(date +%F).sql

# Uploaded files + exports (named volumes)
docker run --rm -v scanverse_uploads:/data -v $PWD:/backup alpine tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
docker run --rm -v scanverse_exports:/data -v $PWD:/backup alpine tar czf /backup/exports_$(date +%F).tar.gz -C /data .
```

### 10. Updating the app later

```bash
git pull
docker compose up -d --build
```

### Alternatives to a raw VPS

- **PaaS (Railway / Render / Fly.io)**: point each at the repo; add a managed
  Postgres; mount volumes for `/app/uploads` + `/app/exports`. The nginx
  service can be skipped — the PaaS handles TLS.
- **Docker host panel (Coolify / CapRover)** on a VPS: paste the compose
  file into a project — closest to "one-click" without writing infra by hand.

## Troubleshooting
## Troubleshooting

### `docker compose up` fails to build the backend

The image installs `opencv-python-headless` (needs the `libgl1`/`libglib2.0-0`
system packages) and `tesseract-ocr` — both already installed by the
Dockerfile. If the build times out, give the builder more time/disk.

### "type 'filtertype' does not exist" during `alembic upgrade head`

This was a real bug in an early migration (the enum was created twice) and is
fixed; on a fresh database it must not recur. If you see it, you're running a
pre-fix image — rebuild with `docker compose build --no-cache backend`.

### Passwords fail on login right after registering

`passlib` + `bcrypt>=4.1` are incompatible; `requirements.txt` pins
`bcrypt==4.0.1`. If you installed deps outside Docker, `pip install -r
requirements.txt` again to get the pinned version.

### OCR returns no text / very low confidence

- Check the scan has enough contrast (re-run OCR after applying a filter).
- `preprocess=true` (default) deskews and lifts contrast before recognition —
  disable it (`?preprocess=false`) if it hurts a particular image.
- OCR is synchronous; on a very large scan it can take a few seconds (Tesseract
  runs in-process, no model download on first use).

### Frontend can't reach the API (404s on /api)

- In Docker, the Nginx proxy routes `/api/`, `/media/`, `/health` to the
  backend — verify `nginx/nginx.conf` is mounted (`docker compose ps`).
- Locally, the Vite proxy defaults to `http://backend:8000`; run the backend
  outside Docker with `VITE_API_PROXY_TARGET=http://localhost:8000 npm run dev`.

### Uploads rejected as invalid image

`validate_image_content` re-verifies that file bytes actually decode as the
claimed format (defense against renamed/poisoned files). Re-export the image
or capture a new one if a genuine file is rejected.

### "413 File exceeds the 25 MB upload limit"

Raise `MAX_UPLOAD_MB` in `backend/.env` **and** `client_max_body_size` in
`nginx/nginx.conf` together.

### Forgot-password flow returns no token in production

By design: production must email the reset link (SMTP wiring is a documented
roadmap item). In development the token is returned in the API response and
the frontend links to it directly.

## Logs & debugging

```bash
docker compose logs -f backend      # uvicorn + app logs
docker compose logs -f nginx        # proxy errors
docker compose exec backend ls /app/uploads   # inspect stored files
```

The backend logs every request through uvicorn; app-level errors surface in
the same stream.
