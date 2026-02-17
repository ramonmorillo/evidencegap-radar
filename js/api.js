// js/api.js

const WORKER_BASE = "https://red-surf-9fd1.ramon-morillo-verdugo.workers.dev";

function apiBase() {
  const host = window.location.hostname;
  const isGitHubPages = host.endsWith("github.io");
  return isGitHubPages ? WORKER_BASE : "";
}

/**
 * Clasifica un error de red/fetch en una categoría legible para el usuario.
 */
function classifyError(err, url) {
  const msg = (err?.message || "").toLowerCase();

  // Timeout (AbortController o fetch timeout)
  if (err?.name === "AbortError") {
    return "Búsqueda cancelada (se lanzó una nueva o se agotó el tiempo).";
  }

  // Rate limit
  if (msg.includes("429") || msg.includes("rate") || msg.includes("too many")) {
    return "Demasiadas peticiones (rate limit). Espera unos segundos y reintenta.";
  }

  // CORS
  if (msg.includes("cors") || msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return `Error de red o CORS al conectar con la API (${url}). ` +
      "Comprueba tu conexión a Internet y que no haya un bloqueador activo.";
  }

  // HTTP errors
  if (msg.includes("http 5")) {
    return "Error en el servidor de la API. Reintenta en unos minutos.";
  }
  if (msg.includes("http 4")) {
    return `Error en la petición (${err.message}). Revisa los términos de búsqueda.`;
  }

  // Timeout genérico
  if (msg.includes("timeout")) {
    return "La petición tardó demasiado (timeout). Reintenta o simplifica la búsqueda.";
  }

  // Genérico
  return `Error: ${err?.message || String(err)}`;
}

/**
 * Realiza una petición GET JSON a la API.
 * @param {string} path — Ruta de la API (ej: /api/pubmed/esearch?...)
 * @param {object} opts
 * @param {AbortSignal} [opts.signal] — Señal de AbortController para cancelar
 * @returns {Promise<any>}
 */
export async function getJson(path, { signal } = {}) {
  const base = apiBase();
  const url = (base ? base.replace(/\/$/, "") : "") + path;

  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { "Accept": "application/json" },
      signal
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("API ERROR →", url, resp.status, text);
      throw new Error(`HTTP ${resp.status}`);
    }

    return await resp.json();
  } catch (e) {
    // No logueamos AbortError (es intencional)
    if (e?.name !== "AbortError") {
      console.error("API ERROR →", url, e);
    }
    // Enriquecemos el error con mensaje clasificado
    e._userMessage = classifyError(e, url);
    throw e;
  }
}
