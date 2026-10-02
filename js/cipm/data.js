// CIPM Finder — carga y normalización de la base de datos local (data/cipm.json).
// Esquema (schemaVersion 1) documentado en README.md, sección "CIPM Finder".

const DATA_URL = new URL("../../data/cipm.json", import.meta.url);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Normaliza un registro: tipos coherentes, CN siempre como array, fecha ISO o null. */
export function normalizeRecord(raw, i) {
  const codes = Array.isArray(raw.codigoNacional) ? raw.codigoNacional : [raw.codigoNacional];
  const fecha = str(raw.fecha);
  const pagina = Number.parseInt(raw.pagina, 10);
  return {
    id: str(raw.id) || `rec-${i}`,
    demo: raw.demo === true,
    cipm: str(raw.cipm),
    fecha: fecha && ISO_DATE.test(fecha) ? fecha : null,
    principioActivo: str(raw.principioActivo),
    nombreComercial: str(raw.nombreComercial),
    codigoNacional: codes.map(str).filter(Boolean),
    tipo: str(raw.tipo),
    indicacion: str(raw.indicacion),
    decision: str(raw.decision),
    extracto: str(raw.extracto),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : null,
    url: /^https?:\/\//i.test(str(raw.url) || "") ? str(raw.url) : null
  };
}

/** Descarga y normaliza el dataset. Devuelve { meta, records }. */
export async function loadCipmData() {
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const rawRecords = Array.isArray(json?.records) ? json.records : [];
  const records = rawRecords
    .filter(r => r && typeof r === "object")
    .map(normalizeRecord)
    // Un registro sin identificación del medicamento no es localizable
    .filter(r => r.principioActivo || r.nombreComercial || r.codigoNacional.length);
  const meta = json?.meta && typeof json.meta === "object" ? json.meta : {};
  return {
    meta,
    records,
    hasDemo: meta.isDemo === true || records.some(r => r.demo)
  };
}
