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

function docLink(r) {
  if (!r.url) {
    return r.demo
      ? `<span class="cipm-na">Sin documento (registro de demostración)</span>`
      : `<span class="cipm-na">Enlace no disponible</span>`;
  }
  // #page=N lo interpretan la mayoría de visores PDF de navegador
  const href = r.pagina ? `${r.url}#page=${r.pagina}` : r.url;
  const label = r.pagina ? `Abrir documento oficial (p. ${r.pagina})` : "Abrir documento oficial";
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function resultCard(r) {
  const name = [r.principioActivo, r.nombreComercial].filter(Boolean).map(esc).join(" · ");
  const cn = r.codigoNacional.length ? r.codigoNacional.map(esc).join(", ") : null;
  return `
  <details class="cipm-result${r.demo ? " is-demo" : ""}">
    <summary>
      <div class="cipm-result-head">
        <span class="cipm-num">CIPM ${val(r.cipm)}</span>
        <span class="cipm-date">${r.fecha ? esc(formatDate(r.fecha)) : NA}</span>
        ${r.tipo ? `<span class="cipm-type">${esc(r.tipo)}</span>` : ""}
        ${r.demo ? demoBadge() : ""}
      </div>
      <div class="cipm-result-title">${name || NA}</div>
      ${r.decision ? `<div class="cipm-result-decision">${esc(r.decision)}</div>` : ""}
    </summary>
    <div class="cipm-result-body">
      <dl class="cipm-dl">
        <dt>Número de CIPM</dt><dd>${val(r.cipm)}</dd>
        <dt>Fecha</dt><dd>${r.fecha ? esc(formatDate(r.fecha)) + ` <small>(${esc(r.fecha)})</small>` : NA}</dd>
        <dt>Principio activo</dt><dd>${val(r.principioActivo)}</dd>
        <dt>Nombre comercial</dt><dd>${val(r.nombreComercial)}</dd>
        <dt>Código nacional</dt><dd>${cn ? cn : NA}</dd>
        <dt>Tipo de acuerdo</dt><dd>${val(r.tipo)}</dd>
        <dt>Indicación</dt><dd>${val(r.indicacion)}</dd>
        <dt>Resultado</dt><dd>${val(r.decision)}</dd>
        <dt>Página del documento</dt><dd>${r.pagina ? esc(r.pagina) : NA}</dd>
        <dt>Documento</dt><dd>${docLink(r)}</dd>
      </dl>
      ${r.extracto ? `<div class="cipm-extract"><div class="cipm-extract-label">Extracto del acuerdo</div><p>${esc(r.extracto)}</p></div>` : ""}
    </div>
  </details>`;
}

export function renderResults(records) {
  return `<div class="cipm-results-list">${records.map(resultCard).join("")}</div>`;
}

export function renderEmpty() {
  return `<div class="empty-state cipm-empty"><p><b>Sin resultados</b></p>
    <p>No se han encontrado apariciones de este medicamento en la base de datos disponible.</p></div>`;
}

export function renderIdle(total) {
  return `<div class="cipm-idle">Introduce un principio activo, nombre comercial o código nacional.
    <span class="cipm-idle-count">${total} registro${total !== 1 ? "s" : ""} en la base de datos local.</span></div>`;
}
