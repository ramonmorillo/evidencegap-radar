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
    return "Demasiadas peticiones (rate limit). Se reintentó automáticamente sin éxito. Espera un minuto y reintenta.";
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

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s → 2s → 4s

/**
 * Sleep that respects AbortController signal.
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Realiza una petición GET JSON a la API.
 * Reintenta automáticamente en caso de HTTP 429 (rate limit) con backoff exponencial.
 * @param {string} path — Ruta de la API (ej: /api/pubmed/esearch?...)
 * @param {object} opts
 * @param {AbortSignal} [opts.signal] — Señal de AbortController para cancelar
 * @param {Function} [opts.onRetry] — Callback (attempt, maxRetries, delayMs) llamado antes de cada reintento
 * @returns {Promise<any>}
 */
export async function getJson(path, { signal, onRetry } = {}) {
  const base = apiBase();
  const url = (base ? base.replace(/\/$/, "") : "") + path;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { "Accept": "application/json" },
        signal
      });

      // Retry on 429 with exponential backoff
      if (resp.status === 429 && attempt < MAX_RETRIES) {
        const ra = parseInt(resp.headers.get("Retry-After"), 10);
        const delay = ra > 0 ? ra * 1000 : BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`429 rate limit → retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`, url);
        if (onRetry) onRetry(attempt + 1, MAX_RETRIES, delay);
        await sleep(delay, signal);
        continue;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error("API ERROR →", url, resp.status, text);
        throw new Error(`HTTP ${resp.status}`);
      }

      return await resp.json();
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      console.error("API ERROR →", url, e);
      e._userMessage = classifyError(e, url);
      throw e;
    }
  }

  // All retries exhausted (429 on last attempt)
  const err = new Error("HTTP 429");
  err._userMessage = classifyError(err, url);
  throw err;
}
