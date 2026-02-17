# EvidenceGap Radar

Herramienta de exploración rápida del "paisaje de evidencia" para preguntas PICO-lite, combinando señales de **PubMed** y **ClinicalTrials.gov**.

Creado por Ramón Morillo · Febrero 2026

---

## Notas técnicas (Iteración 1 — Robustez y UX)

### Caché con TTL

- Los resultados de cada búsqueda se almacenan en `localStorage` con un **TTL de 15 minutos**.
- La clave de caché se genera con un hash (djb2) de `query + filtros`.
- Si los resultados provienen de caché, se muestra un indicador **"Resultados en caché"** junto al título de resultados.
- Botón **"Limpiar caché"** en la barra de acciones para borrar todas las entradas.

### AbortController

- Cada nueva búsqueda **cancela automáticamente** la petición anterior mediante `AbortController`.
- Esto evita condiciones de carrera (race conditions) si el usuario lanza búsquedas rápidas seguidas.
- Los errores de tipo `AbortError` se ignoran silenciosamente (no se muestran al usuario).

### Debounce

- El botón "Analizar" y la tecla Enter tienen un **debounce de 400 ms** para evitar llamadas duplicadas por doble-click o pulsaciones rápidas.

### Estados UI

- **Loading**: spinner animado + texto "Consultando PubMed y ClinicalTrials.gov…"
- **Empty**: mensaje claro cuando no hay resultados, sugiriendo sinónimos/MeSH.
- **Error**: mensajes clasificados por tipo (CORS, timeout, rate limit, error de servidor, red).

### Persistencia

- La última búsqueda (campos PICO + ventana temporal) se guarda en `localStorage` y se restaura automáticamente al recargar la página.
- El botón "Reiniciar" limpia los campos y borra la búsqueda persistida.

### Límites conocidos

- **PubMed**: máximo 10 publicaciones recientes devueltas por consulta.
- **ClinicalTrials.gov**: máximo 25 ensayos por consulta.
- **Caché**: solo almacena el HTML renderizado; un cambio en la lógica de renderizado requiere limpiar caché manualmente.
- **Sin dependencias externas**: todo es vanilla JS, sin librerías adicionales.
