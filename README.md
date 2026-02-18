# EvidenceGap Radar

Herramienta de exploración rápida del "paisaje de evidencia" para preguntas PICO-lite, combinando señales de **PubMed** y **ClinicalTrials.gov**.

Creado por Ramón Morillo · Febrero 2026

---

## Arquitectura

| Capa | Tecnología |
|------|-----------|
| Frontend | Vanilla JS (ES6 modules), CSS puro, SVG |
| Hosting | GitHub Pages (estático) |
| Proxy API | Cloudflare Worker |
| APIs externas | PubMed E-utilities, ClinicalTrials.gov, NLM MeSH Lookup |

**Sin dependencias externas**: no hay `package.json`, bundlers ni frameworks. Todo corre directamente en el navegador.

---

## Fuentes de datos

| Fuente | Endpoint | Qué aporta |
|--------|----------|-----------|
| **PubMed** (E-utilities) | esearch + esummary | Conteos, publicaciones recientes, tipos, SR/MA |
| **ClinicalTrials.gov** v2 | /studies | Ensayos registrados, estados, fases |
| **NLM MeSH Lookup** | id.nlm.nih.gov/mesh/lookup | Autocompletado de descriptores MeSH (CORS nativo) |

Las llamadas a PubMed y ClinicalTrials.gov pasan por un **Cloudflare Worker** (proxy CORS). Las llamadas MeSH van directamente al API de NLM (soporta CORS).

---

## Iteraciones implementadas

### Iteración 1 — Robustez y UX

- **Caché localStorage** con TTL 15 min (clave = hash djb2 de query + filtros).
- **AbortController**: cada búsqueda cancela la anterior.
- **Debounce** 400 ms en botón Analizar y Enter.
- **Estados UI**: loading (spinner), empty (sugerencias), error (clasificados por tipo).
- **Persistencia**: última búsqueda se restaura al recargar.

### Iteración 2 — Query Builder reproducible

- **Sinónimos** como chips por campo PICO (OR dentro del campo, AND entre campos).
- **Query editable** en textarea con vista previa en tiempo real.
- **Copiar** query al portapapeles.
- **5 ejemplos docentes** precargados que rellenan y auto-ejecutan.
- **Estrategia humana**: visualización de la estructura PICO con etiquetas.

### Iteración 3 — Radar Dashboard

- **3 tarjetas**: PubMed (recientes + histórico), ClinicalTrials (total + activos + completados), Síntesis (SR/MA + clasificación).
- **Gráfico temporal**: barras verticales con publicaciones por año (últimos 5 + actual).
- **Tipos de publicación**: barras horizontales de la muestra.
- **Cuadrante**: scatter SVG posicionando pub recientes vs ensayos activos.
- **Pie de fuentes**: donut SVG con PubMed, ClinicalTrials, SR/MA.
- Datos derivados de **consultas paralelas** (Promise.all, 2 batches).

### Iteración 4 — Resultados accionables + Export + Print

- **Tabla Top 20**: PMID, título (link), año, journal, tipo con tags (SR/MA/RCT/OBS/Review/Other).
- **Filtros por tipo**: botones dinámicos para filtrar la tabla.
- **Export CSV**: descarga con columnas PMID, Title, Authors, Journal, Year, PubDate, PublicationType.
- **Export RIS**: formato compatible con gestores de referencia (Zotero, Mendeley).
- **Print layout**: estilos optimizados para impresión / guardar como PDF.

### Iteración 5 — Modo MeSH-only (estricto)

- **Toggle MeSH-only** en el formulario PICO.
- **Autocomplete** contra NLM MeSH Lookup API (Descriptors + Supplementary Concepts).
- **Chips MeSH** con botones Explode ON/OFF y Major Topic ON/OFF.
- **Query MeSH**: genera `[MeSH Terms]`, `[Majr]`, `:noexp` según opciones.
- **Panel de estrategia MeSH** en resultados mostrando términos, UI, tipo y flags.
- **Caché dedicado 24h** para resoluciones MeSH (prefijo `egr_mesh_`).
- **Persistencia** del estado MeSH (modo + términos seleccionados).

---

## Privacidad

- **No se almacena nada en servidor**. Todo se procesa en el navegador.
- El caché usa `localStorage` del navegador (solo local).
- Las consultas pasan por el Cloudflare Worker (proxy) que no registra datos personales.
- Las consultas MeSH van directamente a NLM (API pública).

---

## Caché

| Tipo | Prefijo | TTL | Contenido |
|------|---------|-----|-----------|
| Resultados | `egr_` | 15 min | HTML renderizado del dashboard |
| MeSH | `egr_mesh_` | 24 h | Arrays de descriptores MeSH |
| Persistencia | `egr_lastSearch` | permanente | Última búsqueda (campos + sinónimos + MeSH) |

Botón **"Limpiar caché"** borra solo entradas `egr_*`.

---

## Límites conocidos

- **PubMed**: máximo 20 publicaciones recientes por consulta (retmax=20).
- **ClinicalTrials.gov**: máximo 25 ensayos por consulta.
- **Año por año**: conteos derivados de `reldate` acumulativo (aproximación).
- **Tipos de publicación**: basados en la muestra de top 20 (no son del total).
- **MeSH-only**: puede perder artículos aún no indexados con MeSH (publicaciones muy recientes).
- **Caché HTML**: un cambio en la lógica de renderizado requiere limpiar caché manualmente.
- **Sin offline**: requiere conexión a internet para las APIs.

---

## Estructura de archivos

```
index.html          Página principal
styles.css          Todos los estilos (incluyendo print)
js/
  app.js            Lógica principal, estado, eventos
  api.js            Capa HTTP con AbortController
  cache.js          Utilidades de caché localStorage
  report.js         Renderizado del dashboard y tabla
  charts.js         Gráficos CSS/SVG puros
  export.js         Exportación CSV y RIS
  examples.js       5 ejemplos docentes
  mesh.js           Resolución MeSH, autocomplete, query builder MeSH
```
