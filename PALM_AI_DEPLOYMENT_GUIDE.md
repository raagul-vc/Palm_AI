# PALM AI – Production Deployment & Operations Guide

This guide provides instructions for deploying and operating the Palm AI platform in production on **Render** (or any Docker-compatible container cloud).

---

## 1. Architecture Overview

Palm AI is architected as a **Single-Service Multi-Stage Docker Container**:
1. **Frontend Stage**: Node.js 22 Alpine builds the React 19 application using Vite (`npm run build`), generating static assets into `frontend/dist/`.
2. **Backend Stage**: Python 3.13-slim installs pinned dependencies from `requirements.txt`, copies backend Python scripts, datasets, model weights, and `frontend/dist/`.
3. **Runtime Server**: Gunicorn WSGI server executes Flask (`backend.api:app`).
   - Flask directly serves static assets and client-side HTML fallbacks from `frontend/dist/`.
   - REST API endpoints are hosted on the same origin under `/api/*`.
   - Binds dynamically to `0.0.0.0:$PORT` (defaults to 10000).

---

## 2. Local Docker Verification

To verify the containerized build locally before deploying to production:

```powershell
# 1. Build the production Docker image
docker build -t palm-ai .

# 2. Run the container locally (mapped to port 10000)
docker run --rm -p 10000:10000 -e PORT=10000 palm-ai
```

### Smoke Test Endpoints:
* Web Dashboard: Open `http://localhost:10000/` in a browser.
* Deep Route Refresh: Open `http://localhost:10000/productivity/yield-forecast`.
* Health Check: `curl http://localhost:10000/api/health`
  ```json
  {"status": "healthy", "service": "Palm AI Backend API"}
  ```
* Risk Data: `curl http://localhost:10000/api/risk`
* Drone Summary: `curl http://localhost:10000/api/drone/summary`

---

## 3. Render Production Deployment

### Option A: Automatic Blueprint Deployment (Recommended)
1. Push your changes to GitHub on branch `main`.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New** $\rightarrow$ **Blueprint**.
3. Select the `Palm_AI` repository.
4. Render automatically parses [`render.yaml`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/render.yaml) and creates the `palm-ai` Docker Web Service.
5. Click **Apply**.

### Option B: Manual Web Service Setup
If provisioning manually in the Render Dashboard without Blueprint:
1. Click **New** $\rightarrow$ **Web Service**.
2. Connect repository `https://github.com/raagul-vc/Palm_AI`.
3. Set configuration:
   * **Name**: `palm-ai`
   * **Region**: Singapore, Frankfurt, or Oregon (closest to users)
   * **Branch**: `main`
   * **Root Directory**: `.` (leave empty or dot)
   * **Runtime**: **Docker**
   * **Dockerfile Path**: `./Dockerfile`
   * **Docker Build Context**: `.`
   * **Plan**: Free or Starter
4. Add **Environment Variables** (see table below).
5. Set **Health Check Path**: `/api/health`.
6. Click **Create Web Service**.

---

## 4. Environment Variables Reference

| Variable Name | Required | Default Value | Purpose |
| :--- | :---: | :---: | :--- |
| `PALM_AI_ENV` | **Yes** | `production` | Enables production security mode and disables demo accounts by default. |
| `PYTHONUNBUFFERED` | **Yes** | `1` | Ensures Python logs flush immediately to stdout. |
| `WEB_CONCURRENCY` | No | `1` | Gunicorn worker processes (keep at 1 for free/starter tiers with PyTorch). |
| `YOLO_CONFIG_DIR` | **Yes** | `/tmp/ultralytics` | Writable directory for Ultralytics cache. |
| `MPLCONFIGDIR` | **Yes** | `/tmp/matplotlib` | Writable directory for Matplotlib cache. |
| `PALM_AI_ENABLE_DEMO_ACCOUNTS` | No | `false` | Set to `true` if you want initial demo accounts (`admin@palmai.com`) active. |
| `PALM_AI_DB_PATH` | No | `data/palm_ai.db` | Path to persistent SQLite database file (e.g. `/var/data/palm_ai.db` on disk). |
| `PALM_AI_CORS_ORIGINS` | No | `""` | Comma-separated list of allowed cross-origin domains if accessed externally. |
| `OPENAI_API_KEY` | No | None | Optional. If provided, enables LLM synthesis for agronomic recommendations. If absent, safe deterministic fallback is used. |

---

## 5. Persistent Disk Configuration (Database Persistence Across Restarts)

On Render's Free tier, the filesystem is ephemeral and resets on each deploy or sleep. For production enterprise deployments that require tasks and audit logs to persist across restarts:

1. Upgrade to a paid plan tier (e.g., **Starter** - $7/mo).
2. In the Render Web Service settings, navigate to the **Disks** section.
3. Click **Add Disk**:
   * **Name**: `palm-data`
   * **Mount Path**: `/var/data`
   * **Size**: 1 GB
4. In **Environment Variables**, set:
   * `PALM_AI_DB_PATH`: `/var/data/palm_ai.db`
5. Click **Save Changes**. The SQLite database will now persist across all builds and restarts.

---

## 6. Post-Deployment Verification Checklist

Once deployed, verify the live service using the actual Render service URL (e.g., `https://palm-ai-xxxx.onrender.com`):

- [ ] **Health Check**: `GET /api/health` returns status 200.
- [ ] **Root Application**: Visiting `https://<render-url>/` displays the Estate Command Center with estate selection callout.
- [ ] **Estate Flow**: Selecting "North Estate (PT Palm Indo)" loads all 42 blocks in natural sorted order (B001 to B042).
- [ ] **Block Intelligence**: Clicking Block B001 opens the single-screen view displaying all 7 analysis sections (Risk, Solutions, Productivity, Nutrients, Weather, Drone/Spectral, Field Action Center).
- [ ] **Security Enforcement**: `curl https://<render-url>/api/tasks` returns HTTP 401 with `AUTH_REQUIRED`.
- [ ] **Security Headers**: Check response headers contains `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.
- [ ] **Drone Inference**: Live upload of aerial survey tile produces predictions, class breakdown, and base64 annotated image.
- [ ] **Multispectral Provenance**: Benchmark header clearly shows *"Technical Benchmark / Demonstration Only – German Beech Forest Dataset"*.
