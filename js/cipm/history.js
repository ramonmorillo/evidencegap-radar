// CIPM Finder — histórico por principio activo (funciones puras, sin DOM).
//
// Agrupa los registros de una búsqueda por principio activo:
//   1. Si hay código ATC completo (7 caracteres, nivel de sustancia), la clave es
//      el ATC: así se reúnen marcas, biosimilares y genéricos de la misma sustancia.
//   2. Si no hay ATC (p. ej. notas informativas), el registro se une al grupo cuyo
//      principio activo coincide en texto normalizado; si no existe, forma su propio grupo.
// No se interpreta el contenido: solo se agrupa y se cuenta por el bloque literal.

import { normalizeText, sortRecords } from "./search.js";

const FULL_ATC = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;

function paKey(r) {
  return normalizeText(r.principioActivo || r.nombreComercial || "");
}

/** Clasificación por el bloque literal del documento (para recuentos y color). */
export function blockKind(r) {
  if (r.fuente === "nota") return "nota";
  const b = normalizeText(r.bloque);
  if (b.includes("denegatorio")) return "neg";
  // "Acuerdos de Precio y Financiación…" o, en CIPM 261-262, "Acuerdos favorables"
  if (b.includes("precio y financiacion") || b.includes("favorable")) return "pos";
  return "otro";
}

export function groupByActive(records, order = "desc") {
  const groups = new Map();
  const byPa = new Map();   // principio activo normalizado → clave de grupo
  const add = (key, r) => {
    if (!groups.has(key)) groups.set(key, { key, records: [] });
    groups.get(key).records.push(r);
  };

  // 1) Registros con ATC completo
  for (const r of records) {
    if (r.atc && FULL_ATC.test(r.atc)) {
      const key = `atc:${r.atc}`;
      add(key, r);
      const pk = paKey(r);
      if (pk && !byPa.has(pk)) byPa.set(pk, key);
    }
  }
  // 2) Resto: se unen por principio activo si coincide; si no, grupo propio
  for (const r of records) {
    if (r.atc && FULL_ATC.test(r.atc)) continue;
    const pk = paKey(r);
    add(byPa.get(pk) || `pa:${pk}`, r);
  }

  const out = [...groups.values()].map(g => {
    const recs = sortRecords(g.records, order);
    const dates = recs.map(r => r.fecha).filter(Boolean).sort();
    // Valores únicos (sin distinguir mayúsculas/acentos), conservando la primera forma
    const uniq = (arr) => {
      const seen = new Map();
      arr.filter(Boolean).forEach(x => { const k = normalizeText(x); if (!seen.has(k)) seen.set(k, x); });
      return [...seen.values()];
    };
    const counts = { pos: 0, neg: 0, nota: 0, otro: 0 };
    recs.forEach(r => { counts[blockKind(r)]++; });
    return {
      key: g.key,
      atc: uniq(recs.map(r => r.atc)),
      // Preferir la forma escrita en los Acuerdos (las notas usan minúsculas)
      principios: uniq([...recs.filter(r => r.fuente !== "nota"), ...recs].map(r => r.principioActivo)),
      marcas: uniq(recs.map(r => r.nombreComercial)),
      primera: dates[0] || null,
      ultima: dates[dates.length - 1] || null,
      counts,
      records: recs
    };
  });
  // Grupos con actividad más reciente primero
  return out.sort((a, b) => (b.ultima || "").localeCompare(a.ultima || "") || b.records.length - a.records.length);
}
