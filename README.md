# Visor de información turística de la PID

Visor Leaflet con dos dashboards: información No Ontológica y recursos turísticos del CMS semántico. El dashboard CMS se abre por defecto.

## Publicación estática

La aplicación funciona como un sitio estático. No necesita un servidor Python ni Docker para publicarse: el navegador descarga HTML, CSS, JavaScript y los datos ya preparados.

### GitHub Pages

El flujo de GitHub Actions de `.github/workflows/deploy-pages.yml` publica el visor automáticamente con cada cambio en `main`. En GitHub, configura **Settings → Pages → Build and deployment → Source → GitHub Actions**. El sitio publicado aparecerá en la URL que muestra el entorno `github-pages` en la pestaña Actions.

### Vercel

Importa este repositorio en Vercel. La configuración de `vercel.json` prepara el directorio estático `_site/` y publica solo los archivos del visor y sus datos.

### Preparar los archivos localmente

Se requiere Node.js, sin dependencias adicionales:

```sh
node build_static.mjs
```

El resultado queda en `_site/`, listo para servir desde cualquier hosting estático.

## Desarrollo local con Python (opcional)

Para probar el visor desde el repositorio:

```sh
python app.py
```

Después abre <http://localhost:8000/>. Python solo se usa para servir los archivos localmente; no forma parte del despliegue estático.

## Datos y servicios externos

Se incluyen capas geográficas comprimidas e índices estadísticos ligeros. El navegador las descomprime al cargarlas. Las fuentes originales completas y los archivos de trabajo no forman parte del sitio.

Leaflet y las teselas de OpenStreetMap se cargan desde sus servicios públicos, así que el navegador necesita conexión a Internet para mostrar el mapa base.
