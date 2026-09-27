FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY app.py visor_capas.html ./
COPY Data/visor_estadisticas.json Data/visor_cms_stats.json Data/visor_cms_timeline.json ./Data/
COPY Data/visor_municipios.geojson.gz Data/visor_provincias.geojson.gz Data/visor_comarcas.geojson.gz ./Data/
COPY static/visor_capas.js static/visor_capas.css ./static/
COPY static/img/logo-pid.png ./static/img/

EXPOSE 8000
CMD ["sh", "-c", "exec python app.py --host 0.0.0.0 --port ${PORT:-8000} --no-browser"]
