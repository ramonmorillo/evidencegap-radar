// js/cache.js — Cache en localStorage con TTL

const CACHE_PREFIX = "egr_cache_";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

/**
 * Hash simple (djb2) para generar claves de caché a partir de strings.
 * No es criptográfico, solo necesitamos una clave determinista y corta.
 */
export function hashKey(...parts) {
  const str = parts.join("|");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return CACHE_PREFIX + h.toString(36);
}

/**
 * Obtiene un valor de caché si existe y no ha expirado.
 * Devuelve null si no hay datos válidos.
 */
export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Guarda un valor en caché con timestamp.
 */
export function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage lleno o no disponible — ignorar silenciosamente
  }
}

/**
 * Limpia todas las entradas de caché de EvidenceGap Radar.
 * Devuelve el número de entradas eliminadas.
 */
export function cacheClear() {
  let count = 0;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      toRemove.push(k);
    }
  }
  toRemove.forEach(k => { localStorage.removeItem(k); count++; });
  return count;
}

/**
 * Cuenta entradas de caché vigentes.
 */
export function cacheCount() {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      try {
        const entry = JSON.parse(localStorage.getItem(k));
        if (Date.now() - entry.ts <= CACHE_TTL) count++;
      } catch { /* ignorar */ }
    }
  }
  return count;
}
