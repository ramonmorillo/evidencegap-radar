// js/share.js — Enlace reproducible y snapshot citable

import { esc } from "./util.js";
import { download } from "./export.js";

/**
 * Serializa el estado de búsqueda a un string base64 URL-safe.
 * Maneja UTF-8 correctamente antes de btoa.
 */
export function encodeState(state) {
  const json = JSON.stringify(state);
  // percent-encode UTF-8, then convert each %XX byte to a binary char for btoa
  const binary = encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ".");
}

/**
 * Inverso de encodeState. Devuelve null si el string es inválido.
 */
export function decodeState(str) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");
    const binary = atob(b64);
    const json = decodeURIComponent(
      binary.split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    return JSON.parse(json);
  } catch { return null; }
}

/**
 * Genera y descarga un documento HTML autocontenido con todos los datos
 * de la consulta, la clasificación y la cita sugerida.
 */
export function buildCitableSnapshot(snap) {
  if (!snap) return;
  const {
    fechaISO, fechaLegible, estrategiaPubMed, ventanaLegible,
    modo, pub10y, pubRecent, trialN, trialsActive, srMaCount,
    clasificacion, enlaceReproducible
  } = snap;

  const srLabel = srMaCount != null ? String(srMaCount) : "n/d";
  const cita = `Morillo R. EvidenceGap Radar [software]. Consulta realizada el ${fechaLegible}. Estrategia: ${estrategiaPubMed}. Disponible en: ${enlaceReproducible}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EvidenceGap Radar — Instantánea ${esc(fechaISO)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #222; line-height: 1.6; }
    h1 { font-size: 1.4em; border-bottom: 2px solid #444; padding-bottom: 8px; margin-bottom: 4px; }
    h2 { font-size: 1.05em; margin-top: 28px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    .meta { color: #555; font-size: 0.9em; margin: 4px 0; }
    .badge { display: inline-block; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 4px; padding: 4px 12px; font-weight: bold; }
    .cita { background: #f9f9f9; border-left: 3px solid #888; padding: 12px 16px; font-style: italic; word-break: break-all; margin: 8px 0; }
    .aviso { background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; padding: 12px 16px; font-size: 0.88em; margin-top: 32px; }
    a { color: #1a73e8; word-break: break-all; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.88em; word-break: break-all; display: inline-block; }
  </style>
</head>
<body>
  <h1>EvidenceGap Radar — Instantánea de evidencia</h1>
  <p class="meta"><strong>Fecha y hora:</strong> ${esc(fechaLegible)}</p>
  <p class="meta"><strong>Modo de búsqueda:</strong> ${esc(modo)}</p>

  <h2>Estrategia de búsqueda</h2>
  <p><code>${esc(estrategiaPubMed)}</code></p>
  <p class="meta"><strong>Ventana temporal:</strong> ${esc(ventanaLegible)}</p>

  <h2>Recuentos</h2>
  <table>
    <tr><th>Indicador</th><th>Valor</th></tr>
    <tr><td>Publicaciones ~10 años (PubMed)</td><td>${pub10y}</td></tr>
    <tr><td>Publicaciones en ventana seleccionada</td><td>${pubRecent}</td></tr>
    <tr><td>Ensayos clínicos (total)</td><td>${trialN}</td></tr>
    <tr><td>Ensayos activos / reclutando</td><td>${trialsActive}</td></tr>
    <tr><td>Systematic Reviews + Meta-analyses</td><td>${srLabel}</td></tr>
  </table>

  <h2>Clasificación de madurez</h2>
  <p><span class="badge">${esc(clasificacion.label)}</span></p>
  <p>${esc(clasificacion.rationale)}</p>

  <h2>Enlace reproducible</h2>
  <p><a href="${esc(enlaceReproducible)}">${esc(enlaceReproducible)}</a></p>
  <p class="meta">Este enlace reconstruye la misma estrategia y re-ejecuta la consulta automáticamente.</p>

  <h2>Cita sugerida</h2>
  <div class="cita">${esc(cita)}</div>

  <div class="aviso">
    <strong>Limitaciones:</strong> Los recuentos dependen del estado de indexación de PubMed y ClinicalTrials.gov en el momento de la consulta y pueden variar en futuras ejecuciones. La estrategia de búsqueda sí es re-ejecutable exactamente a través del enlace reproducible. Esta instantánea no constituye una revisión sistemática.
  </div>
</body>
</html>`;

  const slug = fechaISO.replace(/[:.]/g, "-").slice(0, 16);
  download(html, `evidencegap_snapshot_${slug}.html`, "text/html;charset=utf-8;");
}
