# Visor de información turística de la PID

Aplicación web Leaflet con dos dashboards: datos no ontológicos de InfoDestinos y recursos turísticos del CMS semántico. El dashboard CMS se abre por defecto.

## Despliegue

El repositorio incluye un `Dockerfile` listo para plataformas que admiten contenedores. Configura el servicio para construir ese Dockerfile y exponer el puerto asignado en la variable `PORT`.

Para probarlo localmente con Docker:

```sh
docker build -t visor-pid .
docker run --rm -p 8000:8000 visor-pid
```

Después abre <http://localhost:8000/>. El servidor usa solo la biblioteca estándar de Python; no necesita instalar paquetes adicionales.

## Contenido incluido

- `app.py`, la página del visor y sus estilos, scripts y logo.
- Los GeoJSON municipales, provinciales y supramunicipales comprimidos.
- Los índices estadísticos preparados para los dos dashboards y la serie temporal CMS.

Se versionan los resultados ligeros que necesita la aplicación, no las fuentes completas de InfoDestinos, los Excel originales, temporales ni archivos de trabajo.

Leaflet y las teselas de OpenStreetMap se cargan desde sus servicios públicos, por lo que el navegador del usuario necesita conexión a Internet para mostrar el mapa base.

Los ficheros estadísticos y las geometrías que sirven los dashboards se incluyen ya preparados en `Data/`.
