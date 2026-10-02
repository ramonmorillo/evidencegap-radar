// CIPM Finder — búsqueda y ordenación (funciones puras, sin DOM).
// Independiente de la lógica de EvidenceGap Radar.

/** Minúsculas, sin diacríticos, sin ®/™ y con espacios colapsados. */
export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Código nacional: solo dígitos (tolera "712345.6", "712 345", "CN 712345"). */
export function normalizeCode(s) {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Prepara un índice de búsqueda por registro. Solo se indexan los campos
 * de identificación del medicamento (principio activo, nombre comercial,
 * código ATC y código nacional) para evitar falsos positivos en textos libres.
 */
export function buildIndex(records) {
  return records.map(r => ({
    record: r,
    // ATC incluido: permite buscar por código (p. ej. "L01FF")
    text: normalizeText([r.principioActivo, r.nombreComercial, r.atc].filter(Boolean).join(" | ")),
    codes: r.codigoNacional.map(normalizeCode).filter(Boolean)
  }));
}

/**
 * Coincidencia AND por términos: cada término debe aparecer en el texto
 * (principio activo / nombre comercial) o como prefijo/subcadena de algún CN.
 */
export function search(index, query) {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = q.split(" ");
  return index
    .filter(entry => terms.every(t => {
      if (entry.text.includes(t)) return true;
      const digits = normalizeCode(t);
      return digits.length >= 3 && digits.length === t.replace(/[\s.\-]/g, "").length
        && entry.codes.some(c => c.includes(digits));
    }))
    .map(entry => entry.record);
}

/** Orden cronológico: más reciente primero (desc) o más antiguo primero (asc). */
export function sortRecords(records, order = "desc") {
  const dir = order === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    // Registros sin fecha siempre al final
    if (!a.fecha && b.fecha) return 1;
    if (a.fecha && !b.fecha) return -1;
    const byDate = (a.fecha || "").localeCompare(b.fecha || "");
    if (byDate) return dir * byDate;
    const byCipm = String(a.cipm ?? "").localeCompare(String(b.cipm ?? ""), "es", { numeric: true });
    if (byCipm) return dir * byCipm;
    return (a.pagina ?? 0) - (b.pagina ?? 0);
  });
}

/**
 * Clave de agrupación del tipo de acuerdo. "tipo" se guarda como texto literal
 * del acuerdo; la clave solo absorbe diferencias de formato (mayúsculas,
 * acentos, espacios, punto final), nunca de contenido.
 */
export function typeKey(tipo) {
  return normalizeText(tipo).replace(/[.;:]+$/, "");
}

/** Opciones del filtro: un valor por clave, etiqueta = primera forma literal encontrada. */
export function typeOptions(records) {
  const groups = new Map();
  for (const r of records) {
    if (!r.tipo) continue;
    const key = typeKey(r.tipo);
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { key, label: r.tipo, count: 1 });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Filtro básico por tipo de acuerdo (clave de typeKey; "" = todos). */
export function filterByType(records, key) {
  if (!key) return records;
  return records.filter(r => r.tipo && typeKey(r.tipo) === key);
}
