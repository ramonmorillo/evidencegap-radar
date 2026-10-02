// CIPM Finder — renderizado de resultados (HTML escapado).
import { esc } from "../util.js";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const NA = `<span class="cipm-na">No disponible</span>`;
const val = (v) => (v === null || v === undefined || v === "" ? NA : esc(v));

export function demoBadge() {
  return `<span class="cipm-demo-badge" title="Registro ficticio: no corresponde a ningún acuerdo real">Datos de demostración</span>`;
}

/** Etiqueta visual del bloque. El texto mostrado es siempre el literal del documento. */
function blockClass(r) {
  if (r.fuente === "nota") return "is-nota";
  const b = (r.bloque || "").toLowerCase();
  if (b.includes("denegatorio")) return "is-neg";
  if (b.includes("precio y financiaci")) return "is-pos";
  return "";
}

function sourceLabel(r) {
  if (r.fuente === "nota") return "Nota informativa";
  return r.cipm ? `CIPM ${r.cipm}` : "CIPM";
}

function docLink(r) {
  const page = r.pagina ? `#page=${r.pagina}` : "";
  const pTxt = r.pagina ? ` (p. ${r.pagina})` : "";
  // #page=N lo interpretan la mayoría de visores PDF de navegador
  if (r.url) {
    return `<a href="${esc(r.url + page)}" target="_blank" rel="noopener noreferrer">Abrir documento oficial${pTxt}</a>`;
  }
  if (r.archivo) {
    return `<a href="${esc(r.archivo + page)}" target="_blank" rel="noopener">Abrir PDF${pTxt}</a>
      <small class="cipm-muted"> · copia local del documento publicado por el Ministerio</small>`;
  }
  return r.demo
    ? `<span class="cipm-na">Sin documento (registro de demostración)</span>`
    : `<span class="cipm-na">Enlace no disponible</span>`;
}

/** Bloque de texto literal largo (conserva saltos de línea). */
function textBlock(label, text) {
  if (!text) return "";
  return `<div class="cipm-extract"><div class="cipm-extract-label">${esc(label)}</div><p>${esc(text)}</p></div>`;
}

function resultCard(r) {
  const title = [r.nombreComercial, r.principioActivo].filter(Boolean).map(esc).join(" · ");
  const cn = r.codigoNacional.length ? r.codigoNacional.map(esc).join(", ") : null;
  const cls = blockClass(r);
  return `
  <details class="cipm-result ${cls}${r.demo ? " is-demo" : ""}">
    <summary>
      <div class="cipm-result-head">
        <span class="cipm-num">${esc(sourceLabel(r))}</span>
        <span class="cipm-date">${r.fecha ? esc(formatDate(r.fecha)) : NA}</span>
        ${r.bloque && r.fuente !== "nota" ? `<span class="cipm-block ${cls}">${esc(r.bloque)}</span>` : ""}
        ${r.apartado && r.fuente !== "nota" ? `<span class="cipm-type">${esc(r.apartado)}</span>` : ""}
        ${r.provisional ? `<span class="cipm-prov-badge" title="Las notas informativas solo recogen propuestas positivas y tienen carácter provisional">Provisional</span>` : ""}
        ${r.huerfano ? `<span class="cipm-type" title="Marcado con H* en la nota informativa">Huérfano</span>` : ""}
        ${r.demo ? demoBadge() : ""}
      </div>
      <div class="cipm-result-title">${title || NA}${r.atc ? ` <span class="cipm-atc">${esc(r.atc)}</span>` : ""}</div>
      ${r.decision ? `<div class="cipm-result-decision">${esc(r.decision)}</div>` : ""}
    </summary>
    <div class="cipm-result-body">
      <dl class="cipm-dl">
        <dt>Documento</dt><dd>${r.fuente === "nota" ? "Nota informativa (provisional)" : r.cipm ? `Acuerdos CIPM, sesión ${esc(r.cipm)}` : NA}</dd>
        <dt>Fecha de la sesión</dt><dd>${r.fecha ? esc(formatDate(r.fecha)) + ` <small>(${esc(r.fecha)})</small>` : NA}</dd>
        <dt>Bloque</dt><dd>${val(r.bloque)}</dd>
        <dt>Apartado</dt><dd>${val(r.apartado)}</dd>
        <dt>Nombre comercial</dt><dd>${val(r.nombreComercial)}</dd>
        <dt>Principio activo</dt><dd>${val(r.principioActivo)}</dd>
        <dt>Código ATC</dt><dd>${val(r.atc)}</dd>
        <dt>Laboratorio</dt><dd>${val(r.laboratorio)}</dd>
        <dt>Código nacional</dt><dd>${cn ? cn : NA}</dd>
        <dt>Prescripción y dispensación</dt><dd>${val(r.condiciones)}</dd>
        <dt>Página</dt><dd>${r.pagina ? esc(r.pagina) : NA}</dd>
        <dt>PDF</dt><dd>${docLink(r)}</dd>
      </dl>
      ${textBlock("Acuerdo (texto literal)", r.acuerdo)}
      ${textBlock("Indicación objeto del expediente", r.indicacionObjeto)}
      ${textBlock(r.fuente === "nota" ? "Indicación" : "Indicación terapéutica autorizada", r.indicacion)}
      ${textBlock("Indicación terapéutica financiada", r.indicacionFinanciada)}
      ${textBlock("Extracto", r.extracto)}
      ${r.truncado ? `<p class="cipm-muted cipm-trunc">Algún texto se ha recortado por su extensión ([…]). Consulta el PDF para el texto completo.</p>` : ""}
    </div>
  </details>`;
}

export function renderResults(records) {
  return `<div class="cipm-results-list">${records.map(resultCard).join("")}</div>`;
}

export function renderEmpty(coverage) {
  return `<div class="empty-state cipm-empty"><p><b>Sin resultados</b></p>
    <p>No se han encontrado apariciones de este medicamento en la base de datos disponible.</p>
    ${coverage ? `<p class="cipm-muted cipm-coverage-note">Cobertura actual: ${esc(coverage)}. Que no aparezca no implica que el medicamento no haya pasado por la CIPM fuera de esos documentos.</p>` : ""}</div>`;
}

export function renderIdle(total) {
  return `<div class="cipm-idle">Introduce un principio activo, nombre comercial, código nacional o código ATC.
    <span class="cipm-idle-count">${total} registro${total !== 1 ? "s" : ""} en la base de datos local.</span></div>`;
}

/** Resumen legible de los documentos cargados (meta.documentos). */
export function coverageText(docs) {
  if (!Array.isArray(docs) || !docs.length) return "";
  const acuerdos = docs.filter(d => d.tipo === "acuerdos");
  const notas = docs.filter(d => d.tipo === "nota");
  const parts = [];
  if (acuerdos.length) {
    parts.push(`Acuerdos CIPM ${acuerdos.map(d => `${d.cipm} (${formatDate(d.fecha)})`).join(", ")}`);
  }
  if (notas.length) {
    parts.push(`notas informativas de ${notas.map(d => formatDate(d.fecha)).join(", ")}`);
  }
  return parts.join("; ");
}
