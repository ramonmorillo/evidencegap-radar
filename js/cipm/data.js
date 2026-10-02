// CIPM Finder — carga y normalización de la base de datos local (data/cipm.json).
// data/cipm.json se genera con scripts/cipm_extract.py a partir de los PDF de fuentes/.
// Esquema documentado en README.md, sección "CIPM Finder".

const DATA_URL = new URL("../../data/cipm.json", import.meta.url);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_PDF = /^fuentes\/[\w.\-]+\.pdf$/i;

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
  const archivo = str(raw.archivo);
  return {
    id: str(raw.id) || `rec-${i}`,
    demo: raw.demo === true,
    fuente: raw.fuente === "nota" ? "nota" : (raw.fuente === "acuerdos" ? "acuerdos" : null),
    provisional: raw.provisional === true,
    cipm: str(raw.cipm),
    fecha: fecha && ISO_DATE.test(fecha) ? fecha : null,
    bloque: str(raw.bloque),
    apartado: str(raw.apartado),
    tipo: str(raw.tipo),
    principioActivo: str(raw.principioActivo),
    nombreComercial: str(raw.nombreComercial),
    atc: str(raw.atc),
    laboratorio: str(raw.laboratorio),
    codigoNacional: codes.map(str).filter(Boolean),
    huerfano: raw.huerfano === true,
    indicacion: str(raw.indicacion),
    indicacionObjeto: str(raw.indicacionObjeto),
    indicacionFinanciada: str(raw.indicacionFinanciada),
    condiciones: str(raw.condiciones),
    decision: str(raw.decision),
    acuerdo: str(raw.acuerdo),
    extracto: str(raw.extracto),
    truncado: raw.truncado === true,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : null,
    archivo: archivo && LOCAL_PDF.test(archivo) ? archivo : null,
    url: /^https?:\/\//i.test(str(raw.url) || "") ? str(raw.url) : null
  };
}

/** Descarga y normaliza el dataset. Devuelve { meta, records, hasDemo }. */
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
