// js/mesh.js — MeSH resolution, autocomplete, and query building
// Uses NLM MeSH Lookup API (CORS-enabled public API)

const MESH_API = "https://id.nlm.nih.gov/mesh/lookup";
const MESH_CACHE_PREFIX = "egr_mesh_";
const MESH_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Autocomplete MeSH terms (Descriptors + Supplementary Concepts).
 * Returns array of { label, ui, type }.
 */
export async function meshAutocomplete(term, signal) {
  if (!term || term.length < 2) return [];

  const cacheKey = MESH_CACHE_PREFIX + hashSimple(term.toLowerCase());
  const cached = getMeshCache(cacheKey);
  if (cached) return cached;

  try {
    const enc = encodeURIComponent(term);
    const [descriptors, supplements] = await Promise.all([
      fetchJson(`${MESH_API}/descriptor?label=${enc}&match=contains&limit=8`, signal),
      fetchJson(`${MESH_API}/term?label=${enc}&match=contains&limit=4`, signal).catch(() => [])
    ]);

    const results = [];
    const seen = new Set();

    for (const d of (descriptors || [])) {
      const ui = extractUI(d.resource);
      if (ui && !seen.has(ui)) {
        seen.add(ui);
        results.push({ label: d.label, ui, type: "Descriptor" });
      }
    }
    for (const s of (supplements || [])) {
      const ui = extractUI(s.resource);
      if (ui && !seen.has(ui)) {
        seen.add(ui);
        results.push({ label: s.label, ui, type: "Supplementary" });
      }
    }

    setMeshCache(cacheKey, results);
    return results;
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    console.error("MeSH API error:", e);
    return [];
  }
}

/**
 * Build a PubMed query from MeSH terms grouped by PICO field.
 * meshByField = { population: [{ label, ui, explode, major }], ... }
 */
export function buildMeshQuery(meshByField) {
  const parts = [];
  for (const [field, terms] of Object.entries(meshByField)) {
    if (!terms?.length) continue;
    const meshParts = terms.map(t => {
      if (t.major) {
        return t.explode !== false
          ? `"${t.label}"[Majr]`
          : `"${t.label}"[Majr:noexp]`;
      }
      return t.explode !== false
        ? `"${t.label}"[MeSH Terms]`
        : `"${t.label}"[MeSH Terms:noexp]`;
    });
    if (meshParts.length === 1) {
      parts.push(meshParts[0]);
    } else {
      parts.push(`(${meshParts.join(" OR ")})`);
    }
  }
  return parts.join(" AND ");
}

/**
 * Render MeSH strategy panel HTML for results display.
 */
export function renderMeshStrategyPanel(meshByField) {
  const FIELD_LABELS = { population: "P", intervention: "I/E", outcome: "O", context: "Contexto" };
  let html = '<div class="mesh-strategy-panel">';
  html += '<h4>Estrategia MeSH-only</h4>';

  for (const [field, terms] of Object.entries(meshByField)) {
    if (!terms?.length) continue;
    const label = FIELD_LABELS[field] || field;
    const chips = terms.map(t => {
      const exp = t.explode !== false ? "Explode" : "noexp";
      const maj = t.major ? "Major" : "";
      const flags = [exp, maj].filter(Boolean).join(", ");
      return `<span class="mesh-info-chip">${esc(t.label)} <small>[${esc(t.ui)}] ${esc(t.type)} (${flags})</small></span>`;
    }).join("");
    html += `<div class="strategy-row"><span class="strategy-label">${esc(label)}</span><div class="strategy-terms">${chips}</div></div>`;
  }

  html += '<p class="mesh-warning">MeSH-only puede perder art\u00edculos no indexados a\u00fan (ej: publicaciones muy recientes).</p>';
  html += '</div>';
  return html;
}

// --- Internal helpers ---

function extractUI(resource) {
  return String(resource || "").split("/").pop() || "";
}

function hashSimple(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function getMeshCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > MESH_TTL) { localStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function setMeshCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* ignore */ }
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function fetchJson(url, signal) {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal
    });
    if (resp.status === 429 && attempt < 3) {
      console.warn(`MeSH 429 → retry ${attempt + 1}/3`);
      await sleepAbortable(1000 * Math.pow(2, attempt), signal);
      continue;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }
  throw new Error("HTTP 429");
}
