# Build from the repository root: docker build -f analytics/Dockerfile -t firefly-analytics .
FROM python:3.13-slim
WORKDIR /app
COPY analytics/pyproject.toml /app/analytics/pyproject.toml
COPY analytics/src /app/analytics/src
RUN pip install --no-cache-dir '/app/analytics[api,weather]'
COPY harmonization/output/grid_monthly_total.parquet /data/harmonization/output/grid_monthly_total.parquet
COPY harmonization/output/harmonization_params.json /data/harmonization/output/harmonization_params.json
COPY public/data/brazil/meta.json /data/public/data/brazil/meta.json
COPY harmonization/output/fire_weather /data/harmonization/output/fire_weather
ENV FIREFLY_DATA_ROOT=/data
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "firefly_analytics.service:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
