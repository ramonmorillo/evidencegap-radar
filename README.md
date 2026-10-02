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

## CIPM Finder (segunda pestaña)

Módulo independiente para buscar apariciones de un medicamento en los acuerdos publicados de la **Comisión Interministerial de Precios de los Medicamentos (CIPM)**. No comparte estado, caché ni lógica con EvidenceGap Radar.

- **Navegación**: pestañas `EvidenceGap Radar | CIPM Finder` (`js/tabs.js`). El hash `#cipm` abre directamente CIPM Finder; los enlaces reproducibles de Radar (`#q=...`) siguen funcionando igual.
- **Carga diferida**: el módulo y su base de datos solo se cargan al abrir la pestaña por primera vez.
- **Búsqueda**: por principio activo, nombre comercial o código nacional; insensible a mayúsculas/acentos; varios términos se combinan con AND; el CN admite puntos o espacios (`000.001`).
- **Resultados**: orden cronológico (más reciente primero por defecto), filtro por tipo de acuerdo (generado a partir de los datos) y ficha desplegable con todos los campos.

### Base de datos local: `data/cipm.json`

```json
{
  "meta": { "schemaVersion": 1, "isDemo": true, "updated": "AAAA-MM-DD", "source": "...", "notes": "..." },
  "records": [
    {
      "id": "único", "demo": false,
      "cipm": "271", "fecha": "AAAA-MM-DD",
      "principioActivo": "...", "nombreComercial": "...",
      "codigoNacional": ["000000"],
      "tipo": "...", "indicacion": "...", "decision": "...", "extracto": "...",
      "pagina": 10, "url": "https://..."
    }
  ]
}
```

- **Granularidad**: un registro por **medicamento y acuerdo CIPM**. Varias presentaciones del mismo medicamento en el mismo acuerdo se agrupan en `codigoNacional` (lista).
- **Texto literal**: `tipo`, `indicacion` y `decision` se transcriben tal cual del acuerdo publicado, sin recodificar. El filtro por tipo agrupa solo variantes de formato (mayúsculas, acentos, espacios, punto final) y muestra la primera forma literal encontrada.
- `codigoNacional` acepta texto o lista.
- Campos ausentes → `null` (la interfaz muestra «No disponible»).
- `url` solo se enlaza si empieza por `http(s)://`; si hay `pagina` se añade `#page=N`.
- Registros con `demo: true` (o `meta.isDemo: true`) se marcan visiblemente como **«Datos de demostración»**.

> ⚠️ **El contenido actual es exclusivamente de demostración** (medicamentos, CN y acuerdos ficticios). No procede de ningún acuerdo real de la CIPM.

### Módulos

```
js/tabs.js          Navegación por pestañas (solo muestra/oculta paneles)
js/cipm/index.js    Controlador del módulo (eventos, estado)
js/cipm/data.js     Carga y normalización de data/cipm.json
js/cipm/search.js   Normalización de texto, búsqueda, orden y filtros (funciones puras)
js/cipm/render.js   Renderizado HTML escapado de resultados
css/cipm.css        Estilos de pestañas y del módulo (prefijos .app-tab / .cipm-)
data/cipm.json      Base de datos local
```

### Extensiones previstas (no implementadas)

Filtros por decisión/fecha/nº CIPM, histórico completo por medicamento, informes públicos de financiación, financiación vigente, exportación y actualización automática de nuevas CIPM. La separación `data` / `search` / `render` permite añadirlas sin tocar EvidenceGap Radar; la actualización automática solo tendría que regenerar `data/cipm.json` con el mismo esquema.

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
