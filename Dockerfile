FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --uid 10001 --create-home appuser
COPY backend/ ./backend/
COPY data/ ./data/
COPY models/ ./models/
COPY outputs/ ./outputs/
COPY drone/ ./drone/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
USER appuser
EXPOSE 10000
CMD ["python", "-m", "gunicorn", "backend.api:app", "--bind", "0.0.0.0:10000", "--workers", "2"]
